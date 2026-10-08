"""
Bounded, per-user asynchronous GDAL jobs for GeoMoz.

This in-process executor is suitable for a single FastAPI instance. Jobs and
temporary files are not durable across deploys or multiple replicas. Production
distributed workloads should use persistent storage and an external queue.
"""

from __future__ import annotations

import io
import json
import math
import os
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, BinaryIO, Dict, Optional

JOB_ROOT = Path(os.getenv("GEOMOZ_JOB_ROOT", "/tmp/geomoz-processing-jobs"))
JOB_TTL_SECONDS = max(60, int(os.getenv("GEOMOZ_JOB_TTL_SECONDS", "7200")))
MAX_UPLOAD_BYTES = max(1024, int(os.getenv("GEOMOZ_JOB_MAX_UPLOAD_BYTES", str(256 * 1024 * 1024))))
MAX_TIMEOUT_SECONDS = max(1, int(os.getenv("GEOMOZ_JOB_MAX_TIMEOUT_SECONDS", "1800")))
_MAX_WORKERS = max(1, int(os.getenv("GEOMOZ_JOB_WORKERS", "2")))
_MAX_ACTIVE_GLOBAL = max(_MAX_WORKERS, int(os.getenv("GEOMOZ_JOB_MAX_ACTIVE_GLOBAL", "4")))
_MAX_ACTIVE_PER_USER = max(1, int(os.getenv("GEOMOZ_JOB_MAX_ACTIVE_PER_USER", "2")))
_CHUNK_SIZE = 1024 * 1024
_ACTIVE_STATES = frozenset({"uploading", "queued", "running"})
_TERMINAL_STATES = frozenset({"completed", "failed"})

_executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="geomoz-gis")
_lock = threading.Lock()
_jobs: Dict[str, "ProcessingJob"] = {}
_futures: Dict[str, Future] = {}
_processes: Dict[str, subprocess.Popen] = {}
_cancellations: Dict[str, threading.Event] = {}


@dataclass
class ProcessingJob:
    id: str
    uid: str
    tool: str
    status: str
    created_at: float
    updated_at: float
    input_name: str
    output_name: Optional[str] = None
    progress: int = 0
    message: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def public_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload.pop("uid", None)
        return payload


def _now() -> float:
    return time.time()


def _job_dir(job_id: str) -> Path:
    return JOB_ROOT / job_id


def _safe_file_name(name: str, default: str) -> str:
    # Backslashes are directory separators on Windows even when hosted on Linux.
    candidate = str(name or default).replace("\\", "/").split("/")[-1].strip()
    allowed = "".join(ch for ch in candidate if ch.isalnum() or ch in "._-")
    if not allowed or allowed in {".", ".."}:
        return default
    return allowed[:120]


def _set_job(job_id: str, **changes: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        for key, value in changes.items():
            if hasattr(job, key):
                setattr(job, key, value)
        job.updated_at = _now()


def _finite_positive(value: Any, label: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(label + " deve ser um número válido.") from exc
    if not math.isfinite(parsed) or parsed <= 0:
        raise ValueError(label + " deve ser um número finito maior que zero.")
    return parsed


def _flag(value: Any, label: str) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    if isinstance(value, str) and value.lower() in ("true", "false"):
        return value.lower() == "true"
    raise ValueError(label + " deve ser true ou false.")


def _execution_timeout(parameters: Dict[str, Any]) -> int:
    value = parameters.get("timeout_seconds", MAX_TIMEOUT_SECONDS)
    if isinstance(value, bool):
        raise ValueError("timeout_seconds deve ser inteiro.")
    try:
        timeout = int(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("timeout_seconds deve ser inteiro.") from exc
    if str(timeout) != str(value) and not isinstance(value, int):
        raise ValueError("timeout_seconds deve ser inteiro.")
    if timeout < 1 or timeout > MAX_TIMEOUT_SECONDS:
        raise ValueError(
            "timeout_seconds deve estar entre 1 e " + str(MAX_TIMEOUT_SECONDS) + "."
        )
    return timeout


def _gdal_tool_command(
    tool: str,
    input_path: Path,
    output_path: Path,
    parameters: Dict[str, Any],
) -> list[str]:
    if tool == "hillshade":
        azimuth = float(parameters.get("azimuth", 315))
        altitude = float(parameters.get("altitude", 45))
        z_factor = _finite_positive(parameters.get("z_factor", 1), "z_factor")
        if not math.isfinite(azimuth) or not 0 <= azimuth <= 360:
            raise ValueError("azimuth deve estar entre 0 e 360 graus.")
        if not math.isfinite(altitude) or not 0 < altitude <= 90:
            raise ValueError("altitude deve estar entre 0 e 90 graus.")
        return [
            "gdaldem", "hillshade", str(input_path), str(output_path),
            "-az", str(azimuth), "-alt", str(altitude), "-z", str(z_factor),
            "-of", "GTiff",
        ]

    if tool == "slope":
        scale = _finite_positive(parameters.get("scale", 1), "scale")
        percent = _flag(parameters.get("percent", False), "percent")
        cmd = [
            "gdaldem", "slope", str(input_path), str(output_path),
            "-s", str(scale), "-of", "GTiff",
        ]
        if percent:
            cmd.append("-p")
        return cmd

    if tool == "aspect":
        zero_for_flat = _flag(parameters.get("zero_for_flat", True), "zero_for_flat")
        cmd = [
            "gdaldem", "aspect", str(input_path), str(output_path), "-of", "GTiff",
        ]
        if zero_for_flat:
            cmd.append("-zero_for_flat")
        return cmd

    if tool == "cog":
        compression = str(parameters.get("compression", "DEFLATE")).upper()
        if compression not in {"DEFLATE", "LZW", "ZSTD", "JPEG", "WEBP"}:
            raise ValueError("compression inválida.")
        try:
            blocksize = int(parameters.get("blocksize", 512))
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("blocksize inválido.") from exc
        if blocksize < 128 or blocksize > 4096 or blocksize % 16:
            raise ValueError("blocksize deve ser múltiplo de 16 entre 128 e 4096.")
        return [
            "gdal_translate", str(input_path), str(output_path), "-of", "COG",
            "-co", "COMPRESS=" + compression, "-co", "BLOCKSIZE=" + str(blocksize),
            "-co", "OVERVIEWS=AUTO",
        ]

    raise ValueError('Ferramenta "' + tool + '" não é suportada pelo backend pesado.')


def _valid_tiff_header(first: bytes) -> bool:
    return first[:4] in (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+")


def _write_input(input_path: Path, source: BinaryIO) -> int:
    size = 0
    with input_path.open("wb") as destination:
        first = source.read(_CHUNK_SIZE)
        if not _valid_tiff_header(first):
            raise ValueError("Ficheiro inválido: esperado GeoTIFF/COG com assinatura TIFF.")
        while first:
            size += len(first)
            if size > MAX_UPLOAD_BYTES:
                raise ValueError(
                    "O ficheiro excede o limite de " +
                    str(MAX_UPLOAD_BYTES // (1024 * 1024)) + " MB."
                )
            destination.write(first)
            first = source.read(_CHUNK_SIZE)
    return size


def _run_job(job_id: str, input_path: Path, output_path: Path) -> None:
    with _lock:
        job = _jobs.get(job_id)
        cancelled = _cancellations.get(job_id)

    if job is None or cancelled is None:
        shutil.rmtree(_job_dir(job_id), ignore_errors=True)
        return

    process: Optional[subprocess.Popen] = None
    try:
        if cancelled.is_set():
            return
        _set_job(job_id, status="running", progress=10, message="A preparar GDAL.")
        cmd = _gdal_tool_command(job.tool, input_path, output_path, job.parameters)
        timeout = _execution_timeout(job.parameters)

        if cancelled.is_set():
            return
        _set_job(job_id, progress=25, message="A executar processamento geoespacial.")
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        with _lock:
            _processes[job_id] = process
            if cancelled.is_set():
                process.terminate()

        stdout, stderr = process.communicate(timeout=timeout)
        if cancelled.is_set():
            return
        if process.returncode != 0:
            detail = (stderr or stdout or "GDAL falhou.").strip()
            raise RuntimeError(detail[-4000:])
        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise RuntimeError("O processamento terminou sem produzir um ficheiro de saída.")

        _set_job(
            job_id, status="completed", progress=100,
            message="Processamento concluído.", output_name=output_path.name,
            error=None,
        )
    except subprocess.TimeoutExpired:
        if process:
            process.kill()
            process.communicate()
        _set_job(
            job_id, status="failed", progress=100,
            error="O processamento excedeu o tempo máximo permitido.",
            message="Job terminado por timeout.",
        )
    except Exception as exc:
        if not cancelled.is_set():
            _set_job(
                job_id, status="failed", progress=100,
                error=str(exc), message="Falha no processamento.",
            )
    finally:
        with _lock:
            _processes.pop(job_id, None)
            _futures.pop(job_id, None)
            removed = cancelled.is_set() or job_id not in _jobs
            _cancellations.pop(job_id, None)
        if removed:
            shutil.rmtree(_job_dir(job_id), ignore_errors=True)


def create_processing_job(
    *,
    uid: str,
    tool: str,
    input_name: str,
    input_bytes: Optional[bytes] = None,
    input_stream: Optional[BinaryIO] = None,
    parameters: Optional[Dict[str, Any]] = None,
) -> ProcessingJob:
    if not uid:
        raise ValueError("Autenticação necessária.")
    if (input_bytes is None) == (input_stream is None):
        raise ValueError("Forneça exatamente uma fonte binária de entrada.")

    parameters = dict(parameters or {})
    _gdal_tool_command(tool, Path("input.tif"), Path("output.tif"), parameters)
    _execution_timeout(parameters)
    input_file = _safe_file_name(input_name, "input.tif")
    if not input_file.lower().endswith((".tif", ".tiff")):
        raise ValueError("Os jobs raster aceitam GeoTIFF/COG (.tif ou .tiff).")

    job_id = uuid.uuid4().hex
    job = ProcessingJob(
        id=job_id, uid=uid, tool=tool, status="uploading",
        created_at=_now(), updated_at=_now(),
        input_name=input_file, progress=0,
        message="A receber GeoTIFF.", parameters=parameters,
    )
    with _lock:
        active = [candidate for candidate in _jobs.values()
                  if candidate.status in _ACTIVE_STATES]
        if len(active) >= _MAX_ACTIVE_GLOBAL:
            raise ValueError("Capacidade de jobs ocupada. Repita mais tarde.")
        if sum(candidate.uid == uid for candidate in active) >= _MAX_ACTIVE_PER_USER:
            raise ValueError("Limite de jobs ativos por utilizador atingido.")
        _jobs[job_id] = job
        _cancellations[job_id] = threading.Event()

    directory = _job_dir(job_id)
    try:
        directory.mkdir(parents=True, exist_ok=False)
        source = io.BytesIO(input_bytes) if input_bytes is not None else input_stream
        assert source is not None
        _write_input(directory / input_file, source)
        _set_job(job_id, status="queued", progress=0, message="Job recebido.")
        output_path = directory / (tool + "_" + job_id[:8] + ".tif")
        future = _executor.submit(_run_job, job_id, directory / input_file, output_path)
        with _lock:
            _futures[job_id] = future
    except Exception:
        with _lock:
            _jobs.pop(job_id, None)
            _cancellations.pop(job_id, None)
            _futures.pop(job_id, None)
        shutil.rmtree(directory, ignore_errors=True)
        raise
    return job


def get_processing_job(job_id: str, uid: str) -> Optional[ProcessingJob]:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.uid != uid:
            return None
        return ProcessingJob(**asdict(job))


def get_processing_job_output(job_id: str, uid: str) -> Optional[Path]:
    job = get_processing_job(job_id, uid)
    if not job or job.status != "completed" or not job.output_name:
        return None
    output_path = _job_dir(job_id) / job.output_name
    return output_path if output_path.is_file() else None


def delete_processing_job(job_id: str, uid: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.uid != uid:
            return False
        _jobs.pop(job_id)
        cancellation = _cancellations.get(job_id)
        if cancellation:
            cancellation.set()
        future = _futures.get(job_id)
        process = _processes.get(job_id)

    # Termination is not awaited in an HTTP request. The worker cleans up once
    # GDAL exits, preventing deletion of the input while GDAL still uses it.
    if process and process.poll() is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    if future is None or future.cancel() or future.done():
        with _lock:
            _futures.pop(job_id, None)
            _cancellations.pop(job_id, None)
        shutil.rmtree(_job_dir(job_id), ignore_errors=True)
    return True


def cleanup_expired_jobs(now: Optional[float] = None) -> int:
    now = _now() if now is None else now
    with _lock:
        expired = [(job_id, job.uid) for job_id, job in _jobs.items()
                   if job.status in _TERMINAL_STATES
                   and now - job.updated_at >= JOB_TTL_SECONDS]
    removed = 0
    for job_id, uid in expired:
        if delete_processing_job(job_id, uid):
            removed += 1
    return removed


def parse_job_parameters(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    if len(raw) > 4096:
        raise ValueError("O objeto parameters excede o limite permitido.")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("parameters deve ser JSON válido.") from exc
    if not isinstance(value, dict):
        raise ValueError("parameters deve ser um objeto JSON.")
    return value
