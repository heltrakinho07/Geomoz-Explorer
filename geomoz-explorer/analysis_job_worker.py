"""One-shot Cloud Run Job worker for GeoMoz analyses."""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)


def run_once() -> int:
    uid = os.getenv("GEOMOZ_JOB_UID", "").strip()
    job_id = os.getenv("GEOMOZ_JOB_ID", "").strip()
    if not uid or not job_id:
        logger.error("GEOMOZ_JOB_UID/GEOMOZ_JOB_ID are required.")
        return 2

    from analysis_jobs import execute_job, get_job
    from api import _prepare_analysis_runner

    job = get_job(uid, job_id)
    if not job:
        logger.error("Persisted analysis job not found: %s", job_id)
        return 3

    if job.get("status") in {"completed", "failed", "cancelled"}:
        logger.info(
            "Analysis job %s is already terminal (%s).",
            job_id,
            job.get("status"),
        )
        return 0

    try:
        _, runner = _prepare_analysis_runner(
            uid,
            str(job.get("type") or ""),
            job.get("payload") or {},
        )
    except Exception:
        logger.exception("Persisted analysis job is invalid: %s", job_id)
        return 4

    try:
        retry_number = max(
            0,
            int(os.getenv("CLOUD_RUN_TASK_ATTEMPT", "0")),
        )
    except ValueError:
        retry_number = 0

    max_retries = max(
        0,
        min(
            int(os.getenv("ANALYSIS_RUN_JOB_MAX_RETRIES", "2")),
            10,
        ),
    )

    # execute_job intentionally raises on retryable failures while attempts
    # remain. Let the exception terminate the process so Cloud Run Jobs can
    # perform its configured task retry.
    result = execute_job(
        uid,
        job_id,
        runner,
        retry_number=retry_number,
        max_retries=max_retries,
    )
    if not result:
        return 3

    logger.info(
        "Analysis job %s finished with status=%s attempt=%s.",
        job_id,
        result.get("status"),
        result.get("attempt"),
    )
    return 0


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    raise SystemExit(run_once())


if __name__ == "__main__":
    main()
