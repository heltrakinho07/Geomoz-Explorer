"""
GIS processing jobs for the GeoMoz FastAPI / Cloud Run backend.

Jobs persist metadata in Firestore and results in Firebase Storage when those
services are available. CI/local development falls back to an in-memory store.
Execution uses a bounded ThreadPoolExecutor so expensive GeoPandas/GDAL work
never blocks the FastAPI event loop.

Cloud Run can still recycle an instance at any time. Jobs therefore maintain a
heartbeat and are reported as stale when an execution disappears. A future
Cloud Tasks dispatcher can reuse the same job contract without changing the
frontend API.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import math
import os
import socket
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import geopandas as gpd
from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)

GIS_JOB_COLLECTION = "gisJobs"
GIS_JOB_WORKERS = max(1, min(int(os.getenv("GIS_JOB_WORKERS", "2")), 8))
GIS_JOB_STALE_SECONDS = max(60, int(os.getenv("GIS_JOB_STALE_SECONDS", "900")))
GIS_JOB_MAX_FEATURES = max(100, int(os.getenv("GIS_JOB_MAX_FEATURES", "100000")))
GIS_JOB_MAX_GEOJSON_BYTES = max(
    1024 * 1024, int(os.getenv("GIS_JOB_MAX_GEOJSON_BYTES", str(25 * 1024 * 1024)))
)

_EXECUTOR = ThreadPoolExecutor(
    max_workers=GIS_JOB_WORKERS,
    thread_name_prefix="geomoz-gis-job",
)
_MEMORY_JOBS: dict[str, dict[str, Any]] = {}
_MEMORY_RESULTS: dict[str, tuple[bytes, str, str]] = {}
_CANCEL_EVENTS: dict[str, threading.Event] = {}
_LOCK = threading.RLock()


class GISJobSource(BaseModel):
    kind: Literal["geojson", "url", "storage"]
    geojson: Optional[dict[str, Any]] = None
    url: Optional[str] = None
    storage_path: Optional[str] = None
    name: Optional[str] = None

    @model_validator(mode="after")
    def validate_payload(self) -> "GISJobSource":
        if self.kind == "geojson":
            if not isinstance(self.geojson, dict):
                raise ValueError("A fonte geojson requer o campo geojson.")
        elif self.kind == "url":
            if not self.url:
                raise ValueError("A fonte url requer o campo url.")
            validate_public_http_url(self.url)
        elif self.kind == "storage":
            if not self.storage_path:
                raise ValueError("A fonte storage requer storage_path.")
        return self


class GISJobCreateRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    tool: Literal[
        "vector_buffer",
        "vector_dissolve",
        "vector_intersection",
        "raster_slope",
        "raster_aspect",
        "raster_hillshade",
    ]
    input: GISJobSource
    secondary_input: Optional[GISJobSource] = None
    parameters: dict[str, Any] = Field(default_factory=dict)


GIS_TOOL_CATALOG: list[dict[str, Any]] = [
    {
        "id": "vector_buffer",
        "name": "Buffer vetorial",
        "kind": "vector",
        "inputs": 1,
        "output": "vector",
        "parameters": {
            "distance": {"type": "number", "default": 1000, "min": 0.001},
            "units": {"type": "select", "default": "meters", "options": ["meters", "kilometers"]},
            "dissolve": {"type": "boolean", "default": False},
        },
    },
    {
        "id": "vector_dissolve",
        "name": "Dissolve vetorial",
        "kind": "vector",
        "inputs": 1,
        "output": "vector",
        "parameters": {"property": {"type": "text", "required": False}},
    },
    {
        "id": "vector_intersection",
        "name": "Interseção vetorial",
        "kind": "vector",
        "inputs": 2,
        "output": "vector",
        "parameters": {},
    },
    {
        "id": "raster_slope",
        "name": "Declive (GDAL)",
        "kind": "raster",
        "inputs": 1,
        "output": "raster",
        "parameters": {
            "units": {"type": "select", "default": "degrees", "options": ["degrees", "percent"]},
            "scale": {"type": "number", "default": 1.0, "min": 0.000001},
        },
    },
    {
        "id": "raster_aspect",
        "name": "Aspeto (GDAL)",
        "kind": "raster",
        "inputs": 1,
        "output": "raster",
        "parameters": {"zero_for_flat": {"type": "boolean", "default": False}},
    },
    {
        "id": "raster_hillshade",
        "name": "Hillshade (GDAL)",
        "kind": "raster",
        "inputs": 1,
        "output": "raster",
        "parameters": {
            "azimuth": {"type": "number", "default": 315.0, "min": 0, "max": 360},
            "altitude": {"type": "number", "default": 45.0, "min": 0, "max": 90},
            "z_factor": {"type": "number", "default": 1.0, "min": 0.000001},
            "multidirectional": {"type": "boolean", "default": False},
        },
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_public_http_url(value: str) -> str:
    """Reject non-HTTP and obvious SSRF targets before GDAL/http access."""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Use um URL HTTP/HTTPS válido.")
    if parsed.username or parsed.password:
        raise ValueError("URLs com credenciais embutidas não são permitidos.")

    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("Hosts locais não são permitidos.")

    try:
        addresses = {
            info[4][0]
            for info in socket.getaddrinfo(
                host, parsed.port or (443 if parsed.scheme == "https" else 80)
            )
        }
    except socket.gaierror as exc:
        raise ValueError(f"Não foi possível resolver o host remoto: {host}") from exc

    for raw in addresses:
        try:
            address = ipaddress.ip_address(raw.split("%", 1)[0])
        except ValueError:
            continue
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise ValueError("O URL aponta para uma rede privada/local e foi bloqueado.")
    return value


def _firebase_clients():
    """Return (firestore_client, storage_bucket) or (None, None)."""
    if os.getenv("GIS_JOBS_FORCE_MEMORY", "").lower() == "true":
        return None, None
    if os.getenv("CI", "").lower() == "true":
        return None, None
    try:
        import firebase_admin
        from firebase_admin import firestore, storage

        if not firebase_admin._apps:
            return None, None
        db = firestore.client()
        bucket_name = os.getenv(
            "FIREBASE_STORAGE_BUCKET",
            "geoprocessamento-426809.firebasestorage.app",
        )
        bucket = storage.bucket(bucket_name)
        return db, bucket
    except Exception as exc:
        logger.warning("GIS jobs: Firebase persistence unavailable, using memory: %s", exc)
        return None, None


def _firestore_job_ref(uid: str, project_id: str, job_id: str):
    db, _ = _firebase_clients()
    if db is None:
        return None
    return (
        db.collection("users")
        .document(uid)
        .collection("projects")
        .document(project_id)
        .collection(GIS_JOB_COLLECTION)
        .document(job_id)
    )


def _memory_key(uid: str, project_id: str, job_id: str) -> str:
    return f"{uid}:{project_id}:{job_id}"


def _put_job(job: dict[str, Any]) -> None:
    key = _memory_key(job["uid"], job["project_id"], job["id"])
    with _LOCK:
        _MEMORY_JOBS[key] = dict(job)
    ref = _firestore_job_ref(job["uid"], job["project_id"], job["id"])
    if ref is not None:
        try:
            ref.set(job, merge=True)
        except Exception as exc:
            logger.warning("GIS jobs: Firestore write failed for %s: %s", job["id"], exc)


def _patch_job(uid: str, project_id: str, job_id: str, **changes: Any) -> dict[str, Any]:
    current = get_job(uid, project_id, job_id, refresh_stale=False)
    if current is None:
        raise KeyError(job_id)
    current = {**current, **changes, "updated_at": utc_now()}
    _put_job(current)
    return current


def get_job(
    uid: str,
    project_id: str,
    job_id: str,
    *,
    refresh_stale: bool = True,
) -> Optional[dict[str, Any]]:
    key = _memory_key(uid, project_id, job_id)
    ref = _firestore_job_ref(uid, project_id, job_id)
    job: Optional[dict[str, Any]] = None

    if ref is not None:
        try:
            snap = ref.get()
            if snap.exists:
                job = snap.to_dict()
        except Exception as exc:
            logger.warning("GIS jobs: Firestore read failed for %s: %s", job_id, exc)

    if job is None:
        with _LOCK:
            cached = _MEMORY_JOBS.get(key)
            job = dict(cached) if cached else None

    if job and refresh_stale and job.get("status") == "running":
        heartbeat = job.get("heartbeat_at") or job.get("updated_at")
        try:
            age = time.time() - datetime.fromisoformat(str(heartbeat)).timestamp()
        except Exception:
            age = 0
        if age > GIS_JOB_STALE_SECONDS:
            job = _patch_job(
                uid,
                project_id,
                job_id,
                status="stale",
                error="A instância de processamento deixou de enviar heartbeat.",
                finished_at=utc_now(),
            )
    return job


def list_jobs(uid: str, project_id: str, limit: int = 25) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 100))
    db, _ = _firebase_clients()
    jobs: list[dict[str, Any]] = []
    if db is not None:
        try:
            ref = (
                db.collection("users")
                .document(uid)
                .collection("projects")
                .document(project_id)
                .collection(GIS_JOB_COLLECTION)
            )
            docs = ref.order_by("created_at", direction="DESCENDING").limit(limit).stream()
            jobs = [doc.to_dict() for doc in docs]
        except Exception as exc:
            logger.warning("GIS jobs: Firestore list failed: %s", exc)

    if not jobs:
        prefix = f"{uid}:{project_id}:"
        with _LOCK:
            jobs = [
                dict(job)
                for key, job in _MEMORY_JOBS.items()
                if key.startswith(prefix)
            ]
        jobs.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        jobs = jobs[:limit]
    return [get_job(uid, project_id, job["id"]) or job for job in jobs]


def _validate_storage_path(uid: str, project_id: str, path: str) -> str:
    clean = path.strip().lstrip("/")
    allowed_prefix = f"users/{uid}/projects/{project_id}/"
    if not clean.startswith(allowed_prefix) or ".." in Path(clean).parts:
        raise ValueError("storage_path fora do projeto autenticado.")
    return clean


def _read_geojson_source(source: GISJobSource, uid: str, project_id: str) -> gpd.GeoDataFrame:
    if source.kind == "geojson":
        raw = source.geojson or {}
        encoded = json.dumps(raw, separators=(",", ":")).encode("utf-8")
        if len(encoded) > GIS_JOB_MAX_GEOJSON_BYTES:
            raise ValueError("O GeoJSON excede o limite do job.")
        if raw.get("type") != "FeatureCollection" or not isinstance(raw.get("features"), list):
            raise ValueError("A entrada deve ser uma FeatureCollection GeoJSON.")
        if len(raw["features"]) > GIS_JOB_MAX_FEATURES:
            raise ValueError(
                f"O job aceita até {GIS_JOB_MAX_FEATURES} feições por entrada."
            )
        return gpd.GeoDataFrame.from_features(raw["features"], crs="EPSG:4326")

    if source.kind == "storage":
        _, bucket = _firebase_clients()
        if bucket is None:
            raise RuntimeError("Firebase Storage não está disponível neste ambiente.")
        path = _validate_storage_path(uid, project_id, source.storage_path or "")
        with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            bucket.blob(path).download_to_filename(tmp_path)
            return gpd.read_file(tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    raise ValueError("Ferramentas vetoriais aceitam GeoJSON ou Storage, não URL arbitrário.")


def _choose_metric_crs(gdf: gpd.GeoDataFrame):
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    try:
        return gdf.estimate_utm_crs() or "EPSG:3857"
    except Exception:
        return "EPSG:3857"


def _vector_buffer(
    gdf: gpd.GeoDataFrame, parameters: dict[str, Any]
) -> gpd.GeoDataFrame:
    distance = float(parameters.get("distance", 1000))
    if not math.isfinite(distance) or distance <= 0:
        raise ValueError("distance deve ser maior que zero.")
    units = str(parameters.get("units", "meters")).lower()
    if units not in {"meters", "kilometers"}:
        raise ValueError("units deve ser meters ou kilometers.")
    if units == "kilometers":
        distance *= 1000

    output_crs = gdf.crs or "EPSG:4326"
    metric = gdf.to_crs(_choose_metric_crs(gdf))
    result = metric.copy()
    result.geometry = metric.geometry.buffer(distance)
    if bool(parameters.get("dissolve", False)) and not result.empty:
        union = (
            result.geometry.union_all()
            if hasattr(result.geometry, "union_all")
            else result.unary_union
        )
        result = gpd.GeoDataFrame({"geometry": [union]}, crs=metric.crs)
    return result.to_crs(output_crs)


def _vector_dissolve(
    gdf: gpd.GeoDataFrame, parameters: dict[str, Any]
) -> gpd.GeoDataFrame:
    prop = str(parameters.get("property", "") or "").strip()
    if prop:
        if prop not in gdf.columns:
            raise ValueError(f'O campo "{prop}" não existe na camada.')
        return gdf.dissolve(by=prop, as_index=False)
    union = (
        gdf.geometry.union_all()
        if hasattr(gdf.geometry, "union_all")
        else gdf.unary_union
    )
    return gpd.GeoDataFrame({"geometry": [union]}, crs=gdf.crs)


def _vector_intersection(
    left: gpd.GeoDataFrame, right: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    if left.crs is None:
        left = left.set_crs("EPSG:4326")
    if right.crs is None:
        right = right.set_crs("EPSG:4326")
    if str(left.crs) != str(right.crs):
        right = right.to_crs(left.crs)
    return gpd.overlay(left, right, how="intersection", keep_geom_type=False)


def _gdf_geojson_bytes(gdf: gpd.GeoDataFrame) -> bytes:
    if gdf.crs is not None and not gdf.crs.is_geographic:
        gdf = gdf.to_crs("EPSG:4326")
    return gdf.to_json(na="null", show_bbox=False).encode("utf-8")


def _planetary_sign_if_needed(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.hostname or not parsed.hostname.lower().endswith(".blob.core.windows.net"):
        return url
    try:
        import httpx

        response = httpx.get(
            "https://planetarycomputer.microsoft.com/api/sas/v1/sign",
            params={"href": url},
            timeout=20,
        )
        response.raise_for_status()
        signed = response.json().get("href")
        if isinstance(signed, str) and signed:
            return signed
    except Exception:
        pass
    return url


def _raster_input_arg(
    source: GISJobSource,
    uid: str,
    project_id: str,
    workdir: Path,
    label: str,
) -> str:
    if source.kind == "url":
        url = _planetary_sign_if_needed(validate_public_http_url(source.url or ""))
        return f"/vsicurl/{url}"

    if source.kind == "storage":
        _, bucket = _firebase_clients()
        if bucket is None:
            raise RuntimeError("Firebase Storage não está disponível neste ambiente.")
        storage_path = _validate_storage_path(uid, project_id, source.storage_path or "")
        suffix = Path(source.name or storage_path).suffix or ".tif"
        local = workdir / f"{label}{suffix}"
        bucket.blob(storage_path).download_to_filename(str(local))
        return str(local)

    raise ValueError("Ferramentas raster aceitam URL/COG ou Firebase Storage.")


def _cancelled(uid: str, project_id: str, job_id: str) -> bool:
    event = _CANCEL_EVENTS.get(_memory_key(uid, project_id, job_id))
    if event and event.is_set():
        return True
    job = get_job(uid, project_id, job_id, refresh_stale=False)
    return bool(job and job.get("cancel_requested"))


def _run_command(
    command: list[str],
    *,
    uid: str,
    project_id: str,
    job_id: str,
) -> None:
    logger.info("GIS job %s command: %s", job_id, " ".join(command[:3]))
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    output_lines: list[str] = []
    while process.poll() is None:
        if _cancelled(uid, project_id, job_id):
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            raise InterruptedError("Job cancelado pelo utilizador.")
        line = process.stdout.readline() if process.stdout else ""
        if line:
            output_lines.append(line.rstrip())
        _patch_job(uid, project_id, job_id, heartbeat_at=utc_now())
        time.sleep(0.25)
    if process.stdout:
        output_lines.extend(line.rstrip() for line in process.stdout.readlines())
    if process.returncode != 0:
        tail = "\n".join(output_lines[-20:]).strip()
        raise RuntimeError(tail or f"GDAL terminou com código {process.returncode}.")


def _run_raster_tool(
    request: GISJobCreateRequest,
    uid: str,
    job_id: str,
    workdir: Path,
) -> tuple[bytes, str, str]:
    input_path = _raster_input_arg(
        request.input, uid, request.project_id, workdir, "input"
    )
    output = workdir / f"{request.tool}.tif"
    p = request.parameters

    if request.tool == "raster_slope":
        command = ["gdaldem", "slope", input_path, str(output), "-of", "GTiff"]
        if str(p.get("units", "degrees")).lower() == "percent":
            command.append("-p")
        scale = float(p.get("scale", 1.0))
        if not math.isfinite(scale) or scale <= 0:
            raise ValueError("scale deve ser maior que zero.")
        command.extend(["-s", str(scale)])
    elif request.tool == "raster_aspect":
        command = ["gdaldem", "aspect", input_path, str(output), "-of", "GTiff"]
        if bool(p.get("zero_for_flat", False)):
            command.append("-zero_for_flat")
    elif request.tool == "raster_hillshade":
        azimuth = float(p.get("azimuth", 315.0))
        altitude = float(p.get("altitude", 45.0))
        z_factor = float(p.get("z_factor", 1.0))
        if not 0 <= azimuth <= 360 or not 0 <= altitude <= 90 or z_factor <= 0:
            raise ValueError("Parâmetros de hillshade fora do intervalo permitido.")
        command = [
            "gdaldem",
            "hillshade",
            input_path,
            str(output),
            "-of",
            "GTiff",
            "-az",
            str(azimuth),
            "-alt",
            str(altitude),
            "-z",
            str(z_factor),
        ]
        if bool(p.get("multidirectional", False)):
            command.append("-multidirectional")
    else:
        raise ValueError(f"Ferramenta raster desconhecida: {request.tool}")

    _run_command(command, uid=uid, project_id=request.project_id, job_id=job_id)
    translated = workdir / f"{request.tool}_optimized.tif"
    _run_command(
        [
            "gdal_translate",
            str(output),
            str(translated),
            "-of",
            "COG",
            "-co",
            "COMPRESS=DEFLATE",
        ],
        uid=uid,
        project_id=request.project_id,
        job_id=job_id,
    )
    return translated.read_bytes(), "image/tiff", translated.name


def _store_result(
    uid: str,
    project_id: str,
    job_id: str,
    content: bytes,
    content_type: str,
    file_name: str,
) -> dict[str, Any]:
    _, bucket = _firebase_clients()
    storage_path = f"users/{uid}/projects/{project_id}/gis-jobs/{job_id}/{file_name}"
    if bucket is not None:
        blob = bucket.blob(storage_path)
        blob.upload_from_string(content, content_type=content_type)
    else:
        with _LOCK:
            _MEMORY_RESULTS[_memory_key(uid, project_id, job_id)] = (
                content,
                content_type,
                file_name,
            )
    return {
        "kind": "vector" if content_type == "application/geo+json" else "raster",
        "storage_path": storage_path if bucket is not None else None,
        "content_type": content_type,
        "file_name": file_name,
        "size_bytes": len(content),
    }


def read_job_result(
    uid: str, project_id: str, job_id: str
) -> Optional[tuple[bytes, str, str]]:
    job = get_job(uid, project_id, job_id)
    if not job or job.get("status") != "succeeded":
        return None
    result = job.get("result") or {}
    storage_path = result.get("storage_path")
    _, bucket = _firebase_clients()
    if storage_path and bucket is not None:
        path = _validate_storage_path(uid, project_id, storage_path)
        blob = bucket.blob(path)
        return (
            blob.download_as_bytes(),
            result.get("content_type") or "application/octet-stream",
            result.get("file_name") or "result.bin",
        )
    with _LOCK:
        return _MEMORY_RESULTS.get(_memory_key(uid, project_id, job_id))


def _execute_job(uid: str, job_id: str, request: GISJobCreateRequest) -> None:
    project_id = request.project_id
    try:
        _patch_job(
            uid,
            project_id,
            job_id,
            status="running",
            progress=5,
            started_at=utc_now(),
            heartbeat_at=utc_now(),
        )
        if _cancelled(uid, project_id, job_id):
            raise InterruptedError("Job cancelado pelo utilizador.")

        if request.tool.startswith("vector_"):
            _patch_job(
                uid,
                project_id,
                job_id,
                progress=20,
                message="A carregar dados vetoriais…",
                heartbeat_at=utc_now(),
            )
            primary = _read_geojson_source(request.input, uid, project_id)
            if request.tool == "vector_buffer":
                output = _vector_buffer(primary, request.parameters)
            elif request.tool == "vector_dissolve":
                output = _vector_dissolve(primary, request.parameters)
            elif request.tool == "vector_intersection":
                if request.secondary_input is None:
                    raise ValueError("vector_intersection requer secondary_input.")
                secondary = _read_geojson_source(
                    request.secondary_input, uid, project_id
                )
                output = _vector_intersection(primary, secondary)
            else:
                raise ValueError(f"Ferramenta vetorial desconhecida: {request.tool}")
            if _cancelled(uid, project_id, job_id):
                raise InterruptedError("Job cancelado pelo utilizador.")
            _patch_job(
                uid,
                project_id,
                job_id,
                progress=75,
                message="A serializar resultado…",
                heartbeat_at=utc_now(),
            )
            content = _gdf_geojson_bytes(output)
            stored = _store_result(
                uid,
                project_id,
                job_id,
                content,
                "application/geo+json",
                f"{request.tool}.geojson",
            )
            output_count = int(len(output))
        else:
            _patch_job(
                uid,
                project_id,
                job_id,
                progress=15,
                message="A preparar raster no GDAL…",
                heartbeat_at=utc_now(),
            )
            with tempfile.TemporaryDirectory(prefix=f"geomoz-{job_id}-") as tmp:
                content, content_type, file_name = _run_raster_tool(
                    request, uid, job_id, Path(tmp)
                )
            _patch_job(
                uid,
                project_id,
                job_id,
                progress=85,
                message="A guardar COG resultante…",
                heartbeat_at=utc_now(),
            )
            stored = _store_result(
                uid,
                project_id,
                job_id,
                content,
                content_type,
                file_name,
            )
            output_count = 1

        _patch_job(
            uid,
            project_id,
            job_id,
            status="succeeded",
            progress=100,
            message="Processamento concluído.",
            result=stored,
            output_count=output_count,
            finished_at=utc_now(),
            heartbeat_at=utc_now(),
        )
    except InterruptedError as exc:
        _patch_job(
            uid,
            project_id,
            job_id,
            status="cancelled",
            progress=100,
            error=str(exc),
            message="Job cancelado.",
            finished_at=utc_now(),
            heartbeat_at=utc_now(),
        )
    except Exception as exc:
        logger.exception("GIS processing job %s failed", job_id)
        _patch_job(
            uid,
            project_id,
            job_id,
            status="failed",
            error=str(exc),
            message="O processamento falhou.",
            finished_at=utc_now(),
            heartbeat_at=utc_now(),
        )
    finally:
        with _LOCK:
            _CANCEL_EVENTS.pop(_memory_key(uid, project_id, job_id), None)


def submit_job(uid: str, request: GISJobCreateRequest) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    now = utc_now()
    job = {
        "id": job_id,
        "uid": uid,
        "project_id": request.project_id,
        "tool": request.tool,
        "status": "queued",
        "progress": 0,
        "message": "Job na fila.",
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "finished_at": None,
        "heartbeat_at": now,
        "cancel_requested": False,
        "parameters": request.parameters,
        "input_name": request.input.name,
        "secondary_input_name": request.secondary_input.name
        if request.secondary_input
        else None,
        "result": None,
        "error": None,
    }
    _put_job(job)
    key = _memory_key(uid, request.project_id, job_id)
    with _LOCK:
        _CANCEL_EVENTS[key] = threading.Event()
    _EXECUTOR.submit(_execute_job, uid, job_id, request)
    return job


def cancel_job(uid: str, project_id: str, job_id: str) -> dict[str, Any]:
    job = get_job(uid, project_id, job_id)
    if job is None:
        raise KeyError(job_id)
    if job.get("status") in {"succeeded", "failed", "cancelled", "stale"}:
        return job

    key = _memory_key(uid, project_id, job_id)
    with _LOCK:
        event = _CANCEL_EVENTS.setdefault(key, threading.Event())
        event.set()
    return _patch_job(
        uid,
        project_id,
        job_id,
        cancel_requested=True,
        message="Cancelamento solicitado…",
    )
