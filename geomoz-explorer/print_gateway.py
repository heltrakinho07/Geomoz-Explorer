"""GeoMoz secure, durable cartographic print gateway (Cloud Tasks + GCS + Firestore).

All public print endpoints require Firebase Auth. No worker token is returned
to clients. Jobs/outputs belong to a single UID and expire automatically.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool

from billing import _db, _uid, firestore
from print_job import InvalidJob, MAX_REQUEST_BYTES, parse_request
from subscription_entitlements import require_plan_feature

logger = logging.getLogger("geomoz.print_gateway")
router = APIRouter(prefix="/geomoz-api/v1/prints", tags=["cartographic-print"])
JOB_ID = re.compile(r"^[a-f0-9]{32}$")
KEY = re.compile(r"^[A-Za-z0-9_-]{16,80}$")
MAX_PDF_BYTES = 32 * 1024 * 1024
JOB_TTL = timedelta(hours=2)
LEASE = timedelta(seconds=140)
MONTHLY_LIMITS = {"community": 0, "academic": 30, "pro": 150, "teams": 500, "enterprise": 2000}
MINUTE_LIMIT = 4


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def _settings():
    """Fail closed until workers, private queue, bucket and OIDC are provisioned."""
    names = (
        "GEOMOZ_PRINT_BUCKET", "GEOMOZ_PRINT_TASKS_QUEUE",
        "GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT", "GEOMOZ_PRINT_DISPATCH_URL",
        "GEOMOZ_PRINT_PYQGIS_URL", "GEOMOZ_PRINT_CARTOPY_URL",
        "GEOMOZ_PRINT_WORKER_TOKEN",
    )
    config = {key: os.environ.get(key, "").strip() for key in names}
    if any(not config[key] for key in names) or len(config["GEOMOZ_PRINT_WORKER_TOKEN"]) < 32:
        raise HTTPException(503, "Serviço remoto de impressão ainda não configurado.")
    if not re.fullmatch(r"projects/[^/]+/locations/[^/]+/queues/[^/]+",
                        config["GEOMOZ_PRINT_TASKS_QUEUE"]):
        raise HTTPException(503, "Fila de impressão não configurada.")
    for name in ("GEOMOZ_PRINT_DISPATCH_URL", "GEOMOZ_PRINT_PYQGIS_URL",
                 "GEOMOZ_PRINT_CARTOPY_URL"):
        url = urlsplit(config[name])
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.fragment:
            raise HTTPException(503, "Destinos privados de impressão inválidos.")
    return config


def _check_app_check(request):
    """App Check is opt-in until the GIS bundle can produce App Check tokens."""
    if os.getenv("GEOMOZ_PRINT_REQUIRE_APP_CHECK", "false").lower() != "true":
        return
    token = request.headers.get("X-Firebase-AppCheck")
    if not token:
        raise HTTPException(401, "App Check obrigatório.")
    try:
        from firebase_admin import app_check
        app_check.verify_token(token)
    except Exception as exc:
        raise HTTPException(401, "App Check inválido.") from exc


def _bucket(config):
    from google.cloud import storage
    return storage.Client().bucket(config["GEOMOZ_PRINT_BUCKET"])


def _task_client():
    from google.cloud import tasks_v2
    return tasks_v2.CloudTasksClient()


def _paths(uid, job_id):
    # Do not put user-provided strings in GCS object paths.
    owner_hash = hashlib.sha256(uid.encode("utf-8")).hexdigest()
    prefix = f"geomoz-prints/{owner_hash}/{job_id}"
    return prefix + "/input.json", prefix + "/result.pdf"


def _allocate(uid, key, digest, job, config):
    """Read quota and idempotency under one Firestore transaction."""
    database = _db()
    plan = require_plan_feature(uid, "cloud_jobs")
    limit = MONTHLY_LIMITS.get(plan, 0)
    from platform_config import get_plan_limits
    concurrency = get_plan_limits(plan)["concurrent_jobs"] or 5
    now = _now()
    quota_ref = database.collection("printQuotas").document(uid)
    key_ref = quota_ref.collection("keys").document(key)
    job_id = secrets.token_hex(16)
    input_path, result_path = _paths(uid, job_id)
    document = database.collection("printJobs").document(job_id)
    tx = database.transaction(max_attempts=20)

    @firestore.transactional
    def claim(transaction):
        quota_snap = quota_ref.get(transaction=transaction)
        key_snap = key_ref.get(transaction=transaction)
        if key_snap.exists:
            previous = key_snap.to_dict() or {}
            if not hmac.compare_digest(previous.get("sha256", ""), digest):
                raise HTTPException(409, "Chave de idempotência reutilizada com outros dados.")
            return previous["jobId"], False

        old = quota_snap.to_dict() if quota_snap.exists else {}
        month = now.strftime("%Y-%m")
        minute = now.strftime("%Y-%m-%dT%H:%M")
        monthly_used = int(old.get("monthlyCount", 0)) if old.get("month") == month else 0
        minute_used = int(old.get("minuteCount", 0)) if old.get("minute") == minute else 0
        # Reclaim abandoned jobs after TTL on every new reservation.
        existing = old.get("activeJobs") if isinstance(old.get("activeJobs"), dict) else {}
        active_jobs = {ident: expiry for ident, expiry in existing.items()
                       if isinstance(expiry, str) and expiry > _iso(now)}
        active = len(active_jobs)
        if monthly_used >= limit:
            raise HTTPException(429, "Limite mensal de impressões do plano atingido.")
        if minute_used >= MINUTE_LIMIT:
            raise HTTPException(429, "Aguarde antes de solicitar outra impressão.")
        if active >= concurrency:
            raise HTTPException(429, "Limite de impressões simultâneas atingido.")
        transaction.create(document, {
            "uid": uid, "engine": job["engine"], "paper": job["paper"],
            "mapCrs": job["map_crs"], "status": "queued",
            "plan": plan, "createdAt": _iso(now), "updatedAt": _iso(now),
            "expiresAt": _iso(now + JOB_TTL), "expireAt": now + JOB_TTL,
            "inputPath": input_path,
            "outputPath": result_path, "sha256": digest,
            "attempt": 0, "sizeBytes": 0, "error": "",
        })
        transaction.create(key_ref, {"jobId": job_id, "sha256": digest,
                                      "createdAt": _iso(now)})
        active_jobs[job_id] = _iso(now + JOB_TTL)
        transaction.set(quota_ref, {
            "month": month, "monthlyCount": monthly_used + 1,
            "minute": minute, "minuteCount": minute_used + 1,
            "active": len(active_jobs), "activeJobs": active_jobs,
            "updatedAt": _iso(now),
        }, merge=True)
        return job_id, True

    return claim(tx)


def _finish(job_id, status, size=0, error=""):
    database = _db()
    job_ref = database.collection("printJobs").document(job_id)
    now = _now()
    tx = database.transaction(max_attempts=20)

    @firestore.transactional
    def complete(transaction):
        snap = job_ref.get(transaction=transaction)
        if not snap.exists:
            return False
        job = snap.to_dict() or {}
        if job.get("status") in ("succeeded", "failed"):
            return False
        quota_ref = database.collection("printQuotas").document(job["uid"])
        quota = quota_ref.get(transaction=transaction).to_dict() or {}
        transaction.set(job_ref, {
            "status": status, "sizeBytes": size, "error": error[:200],
            "updatedAt": _iso(now),
        }, merge=True)
        active_jobs = quota.get("activeJobs") if isinstance(quota.get("activeJobs"), dict) else {}
        active_jobs.pop(job_id, None)
        transaction.set(quota_ref, {"active": len(active_jobs), "activeJobs": active_jobs},
                        merge=True)
        return True

    return complete(tx)


def _enqueue(config, job_id):
    from google.cloud import tasks_v2
    client = _task_client()
    parent = config["GEOMOZ_PRINT_TASKS_QUEUE"]
    request = {
        "parent": parent,
        "task": {
            "name": parent + "/tasks/print-" + job_id,
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": config["GEOMOZ_PRINT_DISPATCH_URL"],
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"jobId": job_id}).encode("utf-8"),
                "oidc_token": {
                    "service_account_email": config["GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT"],
                    "audience": config["GEOMOZ_PRINT_DISPATCH_URL"],
                },
            },
        },
    }
    client.create_task(request=request)


def _owned(job_id, uid):
    if not JOB_ID.fullmatch(job_id):
        raise HTTPException(404, "Impressão não encontrada.")
    snapshot = _db().collection("printJobs").document(job_id).get()
    doc = snapshot.to_dict() if snapshot.exists else None
    if not doc or doc.get("uid") != uid:
        raise HTTPException(404, "Impressão não encontrada.")
    if doc.get("expiresAt", "") <= _iso(_now()):
        raise HTTPException(410, "O ficheiro de impressão expirou.")
    return doc


def _public(job_id, doc):
    return {
        "id": job_id, "status": doc["status"], "engine": doc["engine"],
        "paper": doc["paper"], "createdAt": doc["createdAt"],
        "expiresAt": doc["expiresAt"], "sizeBytes": doc.get("sizeBytes", 0),
        "error": doc.get("error") or None,
        "statusUrl": f"/geomoz-api/v1/prints/{job_id}",
        "resultUrl": f"/geomoz-api/v1/prints/{job_id}/result",
    }


@router.post("", status_code=202)
async def create_print(
    request: Request, uid: str = Depends(_uid),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    _check_app_check(request)
    config = _settings()
    if not idempotency_key or not KEY.fullmatch(idempotency_key):
        raise HTTPException(422, "Idempotency-Key obrigatório (16–80 caracteres).")
    chunks = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_REQUEST_BYTES:
            raise HTTPException(413, "Pacote cartográfico excede 4 MB.")
        chunks.append(chunk)
    try:
        job = parse_request(b"".join(chunks))
    except InvalidJob as exc:
        raise HTTPException(422, str(exc)) from exc
    normalized = json.dumps(job, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(normalized).hexdigest()
    job_id, created = await run_in_threadpool(_allocate, uid, idempotency_key, digest, job, config)
    if created:
        path, _ = _paths(uid, job_id)
        try:
            await run_in_threadpool(
                lambda: _bucket(config).blob(path).upload_from_string(
                    normalized, content_type="application/json", if_generation_match=0))
            await run_in_threadpool(_enqueue, config, job_id)
        except Exception:
            logger.exception("GeoMoz print enqueue failed for job %s", job_id)
            await run_in_threadpool(_finish, job_id, "failed",
                                    error="Serviço de impressão temporariamente indisponível.")
            raise HTTPException(503, "Não foi possível colocar a impressão na fila.")
    doc = await run_in_threadpool(_owned, job_id, uid)
    return _public(job_id, doc)


@router.get("/{job_id}")
async def print_status(job_id: str, request: Request, uid: str = Depends(_uid)):
    _check_app_check(request)
    doc = await run_in_threadpool(_owned, job_id, uid)
    return _public(job_id, doc)


@router.get("/{job_id}/result")
async def print_result(job_id: str, request: Request, uid: str = Depends(_uid)):
    _check_app_check(request)
    doc = await run_in_threadpool(_owned, job_id, uid)
    if doc["status"] != "succeeded":
        raise HTTPException(409, "O PDF ainda não está disponível.")
    config = _settings()
    try:
        data = await run_in_threadpool(
            lambda: _bucket(config).blob(doc["outputPath"]).download_as_bytes())
    except Exception as exc:
        raise HTTPException(503, "Não foi possível obter o PDF.") from exc
    if len(data) > MAX_PDF_BYTES or not data.startswith(b"%PDF-"):
        raise HTTPException(502, "O ficheiro de impressão não é válido.")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="geomoz-mapa.pdf"',
                             "Cache-Control": "private, no-store, max-age=0",
                             "X-Content-Type-Options": "nosniff"})


def _verify_dispatch(request):
    config = _settings()
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Apenas tarefas internas autenticadas.")
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token
        claims = id_token.verify_oauth2_token(
            auth_header.removeprefix("Bearer ").strip(), GoogleRequest(),
            audience=config["GEOMOZ_PRINT_DISPATCH_URL"])
    except Exception as exc:
        raise HTTPException(401, "Credenciais internas inválidas.") from exc
    issuer = claims.get("iss")
    if (issuer not in ("accounts.google.com", "https://accounts.google.com")
            or claims.get("email_verified") is not True
            or claims.get("email") != config["GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT"]):
        raise HTTPException(403, "A tarefa não pertence ao serviço autorizado.")
    return config


def _claim_job(job_id):
    db = _db()
    ref = db.collection("printJobs").document(job_id)
    tx = db.transaction(max_attempts=20)
    now = _now()

    @firestore.transactional
    def claim(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return None
        doc = snap.to_dict() or {}
        if doc.get("status") in ("succeeded", "failed"):
            return None
        if doc.get("expiresAt", "") <= _iso(now):
            return None
        if doc.get("status") == "running" and doc.get("leaseUntil", "") > _iso(now):
            return "busy"
        transaction.set(ref, {
            "status": "running", "attempt": int(doc.get("attempt", 0)) + 1,
            "leaseUntil": _iso(now + LEASE), "updatedAt": _iso(now),
        }, merge=True)
        return doc

    return claim(tx)


@router.post("/internal/dispatch", include_in_schema=False)
async def dispatch_print(request: Request):
    config = _verify_dispatch(request)
    if request.headers.get("Content-Length", "") not in ("", "0"):
        if int(request.headers.get("Content-Length", "0")) > 1024:
            raise HTTPException(413, "Corpo da tarefa demasiado grande.")
    try:
        message = await request.json()
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, "Tarefa inválida.") from exc
    job_id = message.get("jobId") if isinstance(message, dict) else None
    if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        raise HTTPException(400, "ID de impressão inválido.")
    record = await run_in_threadpool(_claim_job, job_id)
    if record == "busy":
        raise HTTPException(503, "Impressão ainda em execução.")
    if record is None:
        return {"status": "noop"}
    engine = record["engine"]
    try:
        data = await run_in_threadpool(lambda: _bucket(config).blob(record["inputPath"]).download_as_bytes())
        if len(data) > MAX_REQUEST_BYTES:
            raise ValueError("Pacote excede 4 MB.")
        url = config["GEOMOZ_PRINT_PYQGIS_URL"] if engine == "pyqgis" else config["GEOMOZ_PRINT_CARTOPY_URL"]
        async with httpx.AsyncClient(timeout=105, follow_redirects=False, trust_env=False) as client:
            worker_response = await client.post(
                url, content=data, headers={"Authorization": "Bearer " + config["GEOMOZ_PRINT_WORKER_TOKEN"],
                                             "Content-Type": "application/json",
                                             "Accept": "application/pdf"})
        if worker_response.status_code != 200:
            raise ValueError("Motor de impressão indisponível.")
        output = worker_response.content
        if (len(output) < 100 or len(output) > MAX_PDF_BYTES
                or not output.startswith(b"%PDF-")):
            raise ValueError("Motor devolveu um ficheiro inválido.")
        await run_in_threadpool(lambda: _bucket(config).blob(record["outputPath"]).upload_from_string(
            output, content_type="application/pdf", if_generation_match=0))
        await run_in_threadpool(_finish, job_id, "succeeded", len(output))
        return {"status": "succeeded"}
    except Exception:
        logger.exception("GeoMoz print failed for job %s", job_id)
        await run_in_threadpool(_finish, job_id, "failed",
                                error="Não foi possível produzir o PDF. Tente novamente.")
        return {"status": "failed"}
