"""Persistent analysis-job lifecycle for GeoMoz.

The first execution backend is a small in-process worker so the product can
adopt a stable job contract immediately. Jobs are persisted to Firestore when
available and mirrored in memory for local development.

This module intentionally isolates the lifecycle from the execution backend:
Cloud Tasks / PubSub / Cloud Run Jobs can replace the local executor later
without changing the frontend contract.
"""

from __future__ import annotations

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

_TERMINAL = {"completed", "failed", "cancelled"}
_jobs: dict[tuple[str, str], dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_futures: dict[tuple[str, str], Future] = {}

# Serialize the first generation of GEE jobs because earthengine-api keeps
# process-global initialization state. This is conservative by design.
_executor = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("ANALYSIS_JOB_WORKERS", "1"))),
    thread_name_prefix="geomoz-analysis",
)


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


def create_job(uid: str, job_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = _now()
    job = {
        "id": uuid.uuid4().hex,
        "user_id": uid,
        "type": job_type,
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
        "execution_mode": "local_executor",
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
    return _public(job) if job else None


def list_jobs(uid: str, limit: int = 20) -> list[dict[str, Any]]:
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
            jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
            return [_public(j) for j in jobs[:limit]]
        except Exception as exc:
            logger.warning("Could not list persisted analysis jobs: %s", exc)

    with _jobs_lock:
        jobs = [
            dict(job)
            for (owner, _), job in _jobs.items()
            if owner == uid
        ]
    jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return [_public(j) for j in jobs[:limit]]


def submit_job(
    uid: str,
    job_type: str,
    payload: dict[str, Any],
    runner: JobRunner,
) -> dict[str, Any]:
    job = create_job(uid, job_type, payload)
    job_id = job["id"]

    def execute() -> None:
        update_job(
            uid,
            job_id,
            status="processing",
            stage="starting",
            progress=5,
            message="A iniciar análise.",
            started_at=_now(),
        )

        def progress(value: int, stage: str, message: str) -> None:
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
            result = runner(progress)
            update_job(
                uid,
                job_id,
                status="completed",
                stage="completed",
                progress=100,
                message="Análise concluída.",
                result=result,
                error=None,
                completed_at=_now(),
            )
        except Exception as exc:
            logger.exception("Analysis job %s failed (%s)", job_id, job_type)
            update_job(
                uid,
                job_id,
                status="failed",
                stage="failed",
                message="A análise não pôde ser concluída.",
                error={
                    "code": "analysis_failed",
                    "message": str(exc),
                    "retryable": True,
                },
                completed_at=_now(),
            )
        finally:
            with _jobs_lock:
                _futures.pop((uid, job_id), None)

    future = _executor.submit(execute)
    with _jobs_lock:
        _futures[(uid, job_id)] = future

    return job


def active_job_count(uid: str | None = None) -> int:
    with _jobs_lock:
        if uid is None:
            return sum(1 for future in _futures.values() if not future.done())
        return sum(
            1
            for (owner, _), future in _futures.items()
            if owner == uid and not future.done()
        )


def is_terminal(status: str) -> bool:
    return status in _TERMINAL
