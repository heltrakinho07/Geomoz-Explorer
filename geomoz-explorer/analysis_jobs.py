"""Persistent analysis-job lifecycle for GeoMoz.

The first execution backend is a small in-process worker so the product can
adopt a stable job contract immediately. Jobs are persisted to Firestore when
available and mirrored in memory for local development.

This module intentionally isolates the lifecycle from the execution backend:
Cloud Tasks / PubSub / Cloud Run Jobs can replace the local executor later
without changing the frontend contract.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

JobRunner = Callable[[Callable[[int, str, str], None]], dict[str, Any]]


class JobCancelledError(RuntimeError):
    """Raised cooperatively when a running analysis job is cancelled."""


_TERMINAL = {"completed", "failed", "cancelled"}
_jobs: dict[tuple[str, str], dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_futures: dict[tuple[str, str], Future] = {}
_STALE_SECONDS = max(300, int(os.getenv("ANALYSIS_JOB_STALE_SECONDS", "3600")))

# Serialize the first generation of GEE jobs because earthengine-api keeps
# process-global initialization state. This is conservative by design.
_executor = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("ANALYSIS_JOB_WORKERS", "1"))),
    thread_name_prefix="geomoz-analysis",
)


def _execution_backend() -> str:
    """Return the configured execution backend.

    Production should use cloud_tasks so analysis CPU is attached to a
    dedicated worker request instead of a background thread in the public API.
    Local development keeps the in-process executor for zero-config usage.
    """
    value = os.getenv("ANALYSIS_EXECUTION_BACKEND", "local").strip().lower()
    if value in {"cloud_tasks", "cloud-tasks", "tasks"}:
        return "cloud_tasks"
    if value in {"cloud_run_jobs", "cloud-run-jobs", "run_jobs", "run-jobs"}:
        return "cloud_run_jobs"
    return "local_executor"


def _cloud_tasks_config() -> dict[str, str]:
    project = (
        os.getenv("ANALYSIS_TASKS_PROJECT", "").strip()
        or os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        or os.getenv("FIREBASE_PROJECT_ID", "").strip()
    )
    location = os.getenv("ANALYSIS_TASKS_LOCATION", "europe-west1").strip()
    queue = os.getenv("ANALYSIS_TASKS_QUEUE", "geomoz-analysis").strip()
    worker_url = os.getenv("ANALYSIS_WORKER_URL", "").strip().rstrip("/")
    service_account = os.getenv("ANALYSIS_TASKS_SERVICE_ACCOUNT", "").strip()
    audience = os.getenv("ANALYSIS_TASKS_AUDIENCE", "").strip() or worker_url

    missing = [
        name
        for name, value in {
            "project": project,
            "location": location,
            "queue": queue,
            "worker_url": worker_url,
            "service_account": service_account,
            "audience": audience,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError("Cloud Tasks não configurado: " + ", ".join(missing))

    return {
        "project": project,
        "location": location,
        "queue": queue,
        "worker_url": worker_url,
        "service_account": service_account,
        "audience": audience,
    }


def _enqueue_cloud_task(uid: str, job_id: str) -> str:
    """Enqueue one idempotently named HTTP task for the private worker."""
    from google.cloud import tasks_v2
    from google.protobuf import duration_pb2

    config = _cloud_tasks_config()
    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(config["project"], config["location"], config["queue"])
    task_name = client.task_path(
        config["project"], config["location"], config["queue"], f"job-{job_id}"
    )
    payload = json.dumps(
        {"uid": uid, "job_id": job_id}, separators=(",", ":")
    ).encode("utf-8")

    dispatch_seconds = max(
        60,
        min(
            int(os.getenv("ANALYSIS_TASK_DISPATCH_DEADLINE_SECONDS", "900")),
            1800,
        ),
    )
    task = {
        "name": task_name,
        "dispatch_deadline": duration_pb2.Duration(seconds=dispatch_seconds),
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f'{config["worker_url"]}/geomoz-api/internal/analysis/run',
            "headers": {"Content-Type": "application/json"},
            "body": payload,
            "oidc_token": {
                "service_account_email": config["service_account"],
                "audience": config["audience"],
            },
        },
    }

    try:
        client.create_task(request={"parent": parent, "task": task})
    except Exception as exc:
        if exc.__class__.__name__ != "AlreadyExists":
            raise
    return task_name


def _cloud_run_job_config() -> dict[str, str]:
    """Resolve the isolated Cloud Run Job used by the production analysis engine."""
    project = (
        os.getenv("ANALYSIS_RUN_JOB_PROJECT", "").strip()
        or os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        or os.getenv("FIREBASE_PROJECT_ID", "").strip()
    )
    location = os.getenv("ANALYSIS_RUN_JOB_LOCATION", "europe-west1").strip()
    job_name = os.getenv("ANALYSIS_RUN_JOB_NAME", "geomoz-analysis-job").strip()

    missing = [
        name
        for name, value in {
            "project": project,
            "location": location,
            "job_name": job_name,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Cloud Run Job não configurado: " + ", ".join(missing)
        )
    return {
        "project": project,
        "location": location,
        "job_name": job_name,
    }


def _enqueue_cloud_run_job(uid: str, job_id: str) -> str:
    """Start one isolated Cloud Run Job execution.

    The API call only starts the execution; the long-running GIS computation
    happens in a separate Cloud Run task with its own process-global GEE state.
    Per-execution env overrides identify the persisted user/job pair.
    """
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    config = _cloud_run_job_config()
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    session = AuthorizedSession(credentials)
    timeout_seconds = max(
        60,
        min(
            int(os.getenv("ANALYSIS_RUN_JOB_TIMEOUT_SECONDS", "900")),
            604800,
        ),
    )
    url = (
        "https://run.googleapis.com/v2/projects/"
        f'{config["project"]}/locations/{config["location"]}/jobs/'
        f'{config["job_name"]}:run'
    )
    body = {
        "overrides": {
            "containerOverrides": [{
                "env": [
                    {"name": "GEOMOZ_JOB_UID", "value": uid},
                    {"name": "GEOMOZ_JOB_ID", "value": job_id},
                ],
            }],
            "taskCount": 1,
            "timeout": f"{timeout_seconds}s",
        },
    }
    response = session.post(url, json=body, timeout=30)
    if not response.ok:
        message = response.text[:1000]
        raise RuntimeError(
            f"Cloud Run Job dispatch falhou ({response.status_code}): {message}"
        )

    data = response.json()
    return str(data.get("name") or f"cloud-run-job:{job_id}")


def _job_is_persisted(uid: str, job_id: str) -> bool:
    """Verify that an isolated worker can load the job from Firestore."""
    doc = _doc(uid, job_id)
    if doc is None:
        return False
    try:
        snapshot = doc.get()
        return bool(snapshot.exists)
    except Exception as exc:
        logger.warning(
            "Could not verify persistent analysis job %s: %s",
            job_id,
            exc,
        )
        return False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@lru_cache(maxsize=1)
def _firestore():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception as exc:
        logger.warning("Firestore unavailable for analysis jobs: %s", exc)
        return None


def _doc(uid: str, job_id: str):
    db = _firestore()
    if db is None:
        return None
    return (
        db.collection("users")
        .document(uid)
        .collection("analysis_jobs")
        .document(job_id)
    )


def _public(job: dict[str, Any]) -> dict[str, Any]:
    """Return a defensive copy suitable for API responses."""
    return {
        "id": job["id"],
        "type": job["type"],
        "project_id": job.get("project_id"),
        "status": job["status"],
        "stage": job.get("stage"),
        "progress": job.get("progress", 0),
        "message": job.get("message"),
        "payload": job.get("payload", {}),
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "execution_mode": job.get("execution_mode", "local_executor"),
        "attempt": int(job.get("attempt") or 0),
        "timings": job.get("timings") or {},
    }


def _save(uid: str, job: dict[str, Any]) -> None:
    key = (uid, job["id"])
    with _jobs_lock:
        _jobs[key] = dict(job)

    doc = _doc(uid, job["id"])
    if doc is not None:
        try:
            doc.set(job)
        except Exception as exc:
            logger.warning("Could not persist analysis job %s: %s", job["id"], exc)


def _load(uid: str, job_id: str) -> Optional[dict[str, Any]]:
    key = (uid, job_id)
    with _jobs_lock:
        cached = _jobs.get(key)
        if cached:
            return dict(cached)

    doc = _doc(uid, job_id)
    if doc is not None:
        try:
            snapshot = doc.get()
            if snapshot.exists:
                job = snapshot.to_dict() or {}
                if job.get("id"):
                    with _jobs_lock:
                        _jobs[key] = dict(job)
                    return job
        except Exception as exc:
            logger.warning("Could not load analysis job %s: %s", job_id, exc)

    return None


def _recover_if_stale(uid: str, job: dict[str, Any]) -> dict[str, Any]:
    """Fail orphaned local jobs after a conservative timeout.

    Cloud Run may terminate an instance while a local executor is processing.
    Without this guard, the persisted job could remain "processing" forever.
    """
    if job.get("execution_mode") not in {
        "local_executor",
        "cloud_tasks",
        "cloud_run_jobs",
    }:
        return job
    if job.get("status") not in {"queued", "processing"}:
        return job

    updated_raw = job.get("updated_at")
    if not updated_raw:
        return job

    try:
        updated = datetime.fromisoformat(updated_raw)
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - updated).total_seconds()
    except (TypeError, ValueError):
        return job

    if age_seconds <= _STALE_SECONDS:
        return job

    job = dict(job)
    job.update({
        "status": "failed",
        "stage": "failed",
        "message": "A execução foi interrompida antes de concluir.",
        "error": {
            "code": "worker_interrupted",
            "message": (
                "O worker da análise foi reiniciado. "
                "Execute novamente a análise."
            ),
            "retryable": True,
        },
        "completed_at": _now(),
        "updated_at": _now(),
    })
    _save(uid, job)
    return job


def create_job(
    uid: str,
    job_type: str,
    payload: dict[str, Any],
    project_id: str | None = None,
    execution_mode: str | None = None,
) -> dict[str, Any]:
    now = _now()
    job = {
        "id": uuid.uuid4().hex,
        "user_id": uid,
        "type": job_type,
        "project_id": project_id,
        "status": "queued",
        "stage": "queued",
        "progress": 0,
        "message": "Análise adicionada à fila.",
        "payload": payload,
        "result": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
        "execution_mode": execution_mode or _execution_backend(),
        "attempt": 0,
        "timings": {
            "queue_wait_ms": None,
            "execution_ms": None,
            "total_ms": None,
        },
    }
    _save(uid, job)
    return _public(job)


def update_job(uid: str, job_id: str, **changes: Any) -> Optional[dict[str, Any]]:
    job = _load(uid, job_id)
    if not job:
        return None

    job.update(changes)
    job["updated_at"] = _now()
    _save(uid, job)
    return _public(job)


def get_job(uid: str, job_id: str) -> Optional[dict[str, Any]]:
    job = _load(uid, job_id)
    if not job:
        return None
    job = _recover_if_stale(uid, job)
    return _public(job)


def list_jobs(
    uid: str,
    limit: int = 20,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 100))
    db = _firestore()

    if db is not None:
        try:
            snapshots = (
                db.collection("users")
                .document(uid)
                .collection("analysis_jobs")
                .stream()
            )
            jobs = [s.to_dict() or {} for s in snapshots]
            jobs = [j for j in jobs if j.get("id")]
            if project_id is not None:
                jobs = [j for j in jobs if j.get("project_id") == project_id]
            jobs = [_recover_if_stale(uid, j) for j in jobs]
            jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
            return [_public(j) for j in jobs[:limit]]
        except Exception as exc:
            logger.warning("Could not list persisted analysis jobs: %s", exc)

    with _jobs_lock:
        jobs = [
            dict(job)
            for (owner, _), job in _jobs.items()
            if owner == uid and (
                project_id is None or job.get("project_id") == project_id
            )
        ]
    jobs = [_recover_if_stale(uid, j) for j in jobs]
    jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return [_public(j) for j in jobs[:limit]]


def execute_job(
    uid: str,
    job_id: str,
    runner: JobRunner,
    *,
    retry_number: int = 0,
    max_retries: int = 0,
) -> Optional[dict[str, Any]]:
    """Execute one persisted job synchronously."""
    job = _load(uid, job_id)
    if not job:
        return None

    if job.get("status") in _TERMINAL:
        return _public(job)

    attempt = int(job.get("attempt") or 0) + 1
    started_at = _now()
    queue_wait_ms = None
    try:
        created_at = datetime.fromisoformat(str(job.get("created_at")))
        started_dt = datetime.fromisoformat(started_at)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if started_dt.tzinfo is None:
            started_dt = started_dt.replace(tzinfo=timezone.utc)
        queue_wait_ms = max(
            0,
            int((started_dt - created_at).total_seconds() * 1000),
        )
    except (TypeError, ValueError):
        queue_wait_ms = None

    update_job(
        uid,
        job_id,
        status="processing",
        stage="starting",
        progress=max(5, int(job.get("progress") or 0)),
        message="A iniciar análise.",
        started_at=job.get("started_at") or started_at,
        attempt=attempt,
        error=None,
        timings={
            **(job.get("timings") or {}),
            "queue_wait_ms": queue_wait_ms,
            "execution_ms": None,
            "total_ms": None,
        },
    )

    def progress(value: int, stage: str, message: str) -> None:
        current = _load(uid, job_id)
        if current and current.get("status") == "cancelled":
            raise JobCancelledError("Análise cancelada pelo utilizador.")
        safe_value = max(0, min(int(value), 99))
        update_job(
            uid,
            job_id,
            status="processing",
            stage=stage,
            progress=safe_value,
            message=message,
        )

    try:
        from gee_module import gee_execution_lock
        with gee_execution_lock():
            result = runner(progress)

        current = _load(uid, job_id)
        if current and current.get("status") == "cancelled":
            return _public(current)

        completed_at = _now()
        current = _load(uid, job_id) or {}
        timings = dict(current.get("timings") or {})
        try:
            started_dt = datetime.fromisoformat(str(current.get("started_at")))
            completed_dt = datetime.fromisoformat(completed_at)
            created_dt = datetime.fromisoformat(str(current.get("created_at")))
            for dt in (started_dt, completed_dt, created_dt):
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            timings["execution_ms"] = max(
                0,
                int((completed_dt - started_dt).total_seconds() * 1000),
            )
            timings["total_ms"] = max(
                0,
                int((completed_dt - created_dt).total_seconds() * 1000),
            )
        except (TypeError, ValueError):
            pass

        return update_job(
            uid,
            job_id,
            status="completed",
            stage="completed",
            progress=100,
            message="Análise concluída.",
            result=result,
            error=None,
            completed_at=completed_at,
            timings=timings,
        )
    except JobCancelledError:
        logger.info("Analysis job %s cancelled", job_id)
        current = _load(uid, job_id)
        if current and current.get("status") == "cancelled":
            return _public(current)
        return update_job(
            uid,
            job_id,
            status="cancelled",
            stage="cancelled",
            message="Análise cancelada.",
            error=None,
            completed_at=_now(),
        )
    except Exception as exc:
        logger.exception("Analysis job %s failed", job_id)
        error = {
            "code": "analysis_failed",
            "message": str(exc),
            "retryable": True,
        }
        if retry_number < max_retries:
            update_job(
                uid,
                job_id,
                status="queued",
                stage="retrying",
                message="Falha temporária. A análise será repetida automaticamente.",
                error=error,
            )
            raise
        return update_job(
            uid,
            job_id,
            status="failed",
            stage="failed",
            message="A análise não pôde ser concluída.",
            error=error,
            completed_at=_now(),
        )


def _submit_local_job(
    uid: str,
    job_id: str,
    runner: JobRunner,
) -> None:
    def execute() -> None:
        try:
            execute_job(uid, job_id, runner)
        finally:
            with _jobs_lock:
                _futures.pop((uid, job_id), None)

    future = _executor.submit(execute)
    with _jobs_lock:
        _futures[(uid, job_id)] = future


def submit_job(
    uid: str,
    job_type: str,
    payload: dict[str, Any],
    runner: JobRunner,
    project_id: str | None = None,
) -> dict[str, Any]:
    execution_mode = _execution_backend()
    job = create_job(
        uid,
        job_type,
        payload,
        project_id=project_id,
        execution_mode=execution_mode,
    )
    job_id = job["id"]

    if execution_mode in {"cloud_tasks", "cloud_run_jobs"}:
        if not _job_is_persisted(uid, job_id):
            logger.warning(
                "Distributed backend %s unavailable because job persistence "
                "could not be verified; falling back to local executor.",
                execution_mode,
            )
            update_job(
                uid,
                job_id,
                execution_mode="local_executor",
                stage="queued",
                message=(
                    "Persistência distribuída indisponível; "
                    "a executar nesta instância."
                ),
            )
            _submit_local_job(uid, job_id, runner)
            return get_job(uid, job_id) or job

    if execution_mode == "cloud_tasks":
        try:
            task_name = _enqueue_cloud_task(uid, job_id)
            return update_job(
                uid,
                job_id,
                stage="queued",
                message="Análise enviada para a fila distribuída.",
                queue_task=task_name,
            ) or job
        except Exception as exc:
            logger.exception("Could not enqueue Cloud Tasks job %s", job_id)
            update_job(
                uid,
                job_id,
                execution_mode="local_executor",
                stage="queued",
                message=(
                    "Fila distribuída indisponível; "
                    "a executar nesta instância."
                ),
                error=None,
            )
            _submit_local_job(uid, job_id, runner)
            return get_job(uid, job_id) or job

    if execution_mode == "cloud_run_jobs":
        try:
            operation_name = _enqueue_cloud_run_job(uid, job_id)
            return update_job(
                uid,
                job_id,
                stage="queued",
                message="Análise enviada para worker Cloud Run isolado.",
                dispatch_ref=operation_name,
            ) or job
        except Exception as exc:
            logger.exception("Could not start Cloud Run analysis job %s", job_id)
            update_job(
                uid,
                job_id,
                execution_mode="local_executor",
                stage="queued",
                message=(
                    "Worker distribuído indisponível; "
                    "a executar nesta instância."
                ),
                error=None,
            )
            _submit_local_job(uid, job_id, runner)
            return get_job(uid, job_id) or job

    _submit_local_job(uid, job_id, runner)
    return job


def cancel_job(uid: str, job_id: str) -> Optional[dict[str, Any]]:
    """Cancel a queued/running job owned by the current user.

    Python threads cannot be force-killed safely, so cancellation is
    cooperative: queued futures are cancelled when possible and running jobs
    stop at the next progress checkpoint. A cancelled job can never be
    overwritten as completed.
    """
    job = _load(uid, job_id)
    if not job:
        return None

    if job.get("status") in _TERMINAL:
        return _public(job)

    key = (uid, job_id)
    with _jobs_lock:
        future = _futures.get(key)
        if future and not future.running():
            future.cancel()

    job.update({
        "status": "cancelled",
        "stage": "cancelled",
        "message": "Análise cancelada pelo utilizador.",
        "error": None,
        "completed_at": _now(),
        "updated_at": _now(),
    })
    _save(uid, job)
    return _public(job)



def active_job_count(uid: str | None = None) -> int:
    """Count queued/processing jobs across local and distributed backends."""
    if uid is not None:
        db = _firestore()
        if db is not None:
            try:
                snapshots = (
                    db.collection("users")
                    .document(uid)
                    .collection("analysis_jobs")
                    .where("status", "in", ["queued", "processing"])
                    .stream()
                )
                return sum(
                    1
                    for snapshot in snapshots
                    if (snapshot.to_dict() or {}).get("status")
                    in {"queued", "processing"}
                )
            except Exception as exc:
                logger.warning("Could not count persisted analysis jobs: %s", exc)

    with _jobs_lock:
        jobs = [
            job
            for (owner, _), job in _jobs.items()
            if uid is None or owner == uid
        ]
    return sum(
        1
        for job in jobs
        if job.get("status") in {"queued", "processing"}
    )


def execution_status() -> dict[str, Any]:
    backend = _execution_backend()
    distributed = backend in {"cloud_tasks", "cloud_run_jobs"}
    status: dict[str, Any] = {
        "backend": backend,
        "distributed": distributed,
        "configured": True,
    }

    if backend == "local_executor":
        status["workers"] = max(
            1,
            int(os.getenv("ANALYSIS_JOB_WORKERS", "1")),
        )
        return status

    try:
        if backend == "cloud_tasks":
            config = _cloud_tasks_config()
            status.update({
                "queue": config["queue"],
                "location": config["location"],
                "worker_configured": bool(config["worker_url"]),
            })
        elif backend == "cloud_run_jobs":
            config = _cloud_run_job_config()
            status.update({
                "job_name": config["job_name"],
                "location": config["location"],
                "worker_configured": True,
            })
    except RuntimeError as exc:
        status.update({
            "configured": False,
            "worker_configured": False,
            "configuration_error": str(exc),
        })
    return status


def is_terminal(status: str) -> bool:
    return status in _TERMINAL
