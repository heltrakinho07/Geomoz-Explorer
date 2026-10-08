"""
GeoMoz heavy-processing job runtime.

The first production-safe job set uses GDAL CLI tools already shipped in the
backend Docker image. Commands are built from an allowlisted tool registry and
executed without a shell, so user input cannot become arbitrary commands.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

JOB_ROOT = Path(os.getenv("GEOMOZ_JOB_ROOT", "/tmp/geomoz-processing-jobs"))
JOB_TTL_SECONDS = int(os.getenv("GEOMOZ_JOB_TTL_SECONDS", "7200"))
MAX_UPLOAD_BYTES = int(os.getenv("GEOMOZ_JOB_MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
_MAX_WORKERS = max(1, int(os.getenv("GEOMOZ_JOB_WORKERS", "2")))

_executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="geomoz-gis")
_lock = threading.Lock()
_jobs: Dict[str, "ProcessingJob"] = {}
_futures: Dict[str, Future] = {}


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
    candidate = Path(name or default).name.strip()
    if not candidate:
        candidate = default
    allowed = "".join(ch for ch in candidate if ch.isalnum() or ch in "._-")
    return allowed or default


def _set_job(job_id: str, **changes: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        for key, value in changes.items():
            if hasattr(job, key):
                setattr(job, key, value)
        job.updated_at = _now()


def _gdal_tool_command(
    tool: str,
    input_path: Path,
    output_path: Path,
    parameters: Dict[str, Any],
) -> list[str]:
    if tool == "hillshade":
        azimuth = float(parameters.get("azimuth", 315))
        altitude = float(parameters.get("altitude", 45))
        z_factor = float(parameters.get("z_factor", 1))
        if not 0 <= azimuth <= 360:
            raise ValueError("azimuth deve estar entre 0 e 360 graus.")
        if not 0 < altitude <= 90:
            raise ValueError("altitude deve estar entre 0 e 90 graus.")
        if z_factor <= 0:
            raise ValueError("z_factor deve ser maior que zero.")
        return [
            "gdaldem",
            "hillshade",
            str(input_path),
            str(output_path),
            "-az",
            str(azimuth),
            "-alt",
            str(altitude),
            "-z",
            str(z_factor),
            "-of",
            "GTiff",
        ]

    if tool == "slope":
        scale = float(parameters.get("scale", 1))
        percent = bool(parameters.get("percent", False))
        if scale <= 0:
            raise ValueError("scale deve ser maior que zero.")
        cmd = [
            "gdaldem",
            "slope",
            str(input_path),
            str(output_path),
            "-s",
            str(scale),
            "-of",
            "GTiff",
        ]
        if percent:
            cmd.append("-p")
        return cmd

    if tool == "aspect":
        zero_for_flat = bool(parameters.get("zero_for_flat", True))
        cmd = [
            "gdaldem",
            "aspect",
            str(input_path),
            str(output_path),
            "-of",
            "GTiff",
        ]
        if zero_for_flat:
            cmd.append("-zero_for_flat")
        return cmd

    if tool == "cog":
        compression = str(parameters.get("compression", "DEFLATE")).upper()
        if compression not in {"DEFLATE", "LZW", "ZSTD", "JPEG", "WEBP"}:
            raise ValueError("compression inválida.")
        blocksize = int(parameters.get("blocksize", 512))
        if blocksize < 128 or blocksize > 4096:
            raise ValueError("blocksize deve estar entre 128 e 4096.")
        return [
            "gdal_translate",
            str(input_path),
            str(output_path),
            "-of",
            "COG",
            "-co",
            f"COMPRESS={compression}",
            "-co",
            f"BLOCKSIZE={blocksize}",
            "-co",
            "OVERVIEWS=AUTO",
        ]

    raise ValueError(f'Ferramenta "{tool}" não é suportada pelo backend pesado.')


def _run_job(job_id: str, input_path: Path, output_path: Path) -> None:
    with _lock:
        job = _jobs[job_id]
        parameters = dict(job.parameters)
        tool = job.tool

    _set_job(job_id, status="running", progress=10, message="A preparar GDAL.")
    try:
        cmd = _gdal_tool_command(tool, input_path, output_path, parameters)
        _set_job(job_id, progress=25, message="A executar processamento geoespacial.")
        completed = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=int(parameters.get("timeout_seconds", 1800)),
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "GDAL falhou.").strip()
            raise RuntimeError(detail[-4000:])

        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise RuntimeError("O processamento terminou sem produzir um ficheiro de saída.")

        _set_job(
            job_id,
            status="completed",
            progress=100,
            message="Processamento concluído.",
            output_name=output_path.name,
            error=None,
        )
    except subprocess.TimeoutExpired:
        _set_job(
            job_id,
            status="failed",
            progress=100,
            error="O processamento excedeu o tempo máximo permitido.",
            message="Job terminado por timeout.",
        )
    except Exception as exc:
        _set_job(
            job_id,
            status="failed",
            progress=100,
            error=str(exc),
            message="Falha no processamento.",
        )


def create_processing_job(
    *,
    uid: str,
    tool: str,
    input_name: str,
    input_bytes: bytes,
    parameters: Optional[Dict[str, Any]] = None,
) -> ProcessingJob:
    if len(input_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"O ficheiro excede o limite de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    parameters = parameters or {}
    job_id = uuid.uuid4().hex
    directory = _job_dir(job_id)
    directory.mkdir(parents=True, exist_ok=False)

    input_file = _safe_file_name(input_name, "input.tif")
    if not input_file.lower().endswith((".tif", ".tiff")):
        shutil.rmtree(directory, ignore_errors=True)
        raise ValueError("Os jobs raster aceitam GeoTIFF/COG (.tif ou .tiff).")

    input_path = directory / input_file
    input_path.write_bytes(input_bytes)
    output_name = f"{tool}_{job_id[:8]}.tif"
    output_path = directory / output_name

    job = ProcessingJob(
        id=job_id,
        uid=uid,
        tool=tool,
        status="queued",
        created_at=_now(),
        updated_at=_now(),
        input_name=input_file,
        progress=0,
        message="Job recebido.",
        parameters=parameters,
    )
    with _lock:
        _jobs[job_id] = job
        _futures[job_id] = _executor.submit(_run_job, job_id, input_path, output_path)
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
    return output_path if output_path.exists() else None


def delete_processing_job(job_id: str, uid: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.uid != uid:
            return False
        future = _futures.pop(job_id, None)
        _jobs.pop(job_id, None)

    if future and not future.done():
        future.cancel()
    shutil.rmtree(_job_dir(job_id), ignore_errors=True)
    return True


def cleanup_expired_jobs(now: Optional[float] = None) -> int:
    now = now or _now()
    expired: list[tuple[str, str]] = []
    with _lock:
        for job_id, job in _jobs.items():
            if now - job.updated_at >= JOB_TTL_SECONDS:
                expired.append((job_id, job.uid))
    removed = 0
    for job_id, uid in expired:
        if delete_processing_job(job_id, uid):
            removed += 1
    return removed


def parse_job_parameters(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("parameters deve ser JSON válido.") from exc
    if not isinstance(value, dict):
        raise ValueError("parameters deve ser um objeto JSON.")
    return value
