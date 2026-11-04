"""GeoMoz subscription entitlements and durable managed-processing quotas.

Only Firebase Admin code may write usage ledgers. GEE computations using
the user's own OAuth credentials are NOT billed with GeoMoz credits.
"""
import os
import re
import time

from fastapi import APIRouter, Depends, HTTPException

from billing import _db, _effective_plan, _uid, _utcnow, firestore
from platform_config import get_plan_limits, get_features

router = APIRouter(prefix="/geomoz-api/entitlements", tags=["entitlements"])

PLAN_FEATURES = {
    "community": frozenset({"local_gis"}),
    "academic": frozenset({"local_gis", "scientific_analysis", "cloud_jobs"}),
    "pro": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports"}),
    "teams": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports", "collaboration"}),
    "enterprise": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports", "collaboration", "institutional_api"}),
}
FEATURE_MODULE = {
    "cloud_jobs": "gis_workspace",
    "scientific_analysis": "remote_sensing",
}
JOB_CREDIT_COST = 5
JOB_LEASE_SECONDS = 3600
JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def managed_jobs_enforced():
    return os.getenv("GEOMOZ_ENTITLEMENTS_JOBS_ENABLED", "false").lower() == "true"


def scientific_access_enforced():
    return os.getenv("GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED", "false").lower() == "true"


def current_cycle(now=None):
    return (now or _utcnow()).strftime("%Y-%m")


def credits_used(record, cycle):
    raw = record.get("creditsUsed", 0) if record.get("creditCycle") == cycle else 0
    try:
        return max(0, int(raw or 0))
    except (TypeError, ValueError):
        return 0


def _limits(plan):
    return get_plan_limits(plan)


def _check_feature(plan, feature, flags):
    if feature not in PLAN_FEATURES.get(plan, ()):
        raise HTTPException(403, "Esta operação requer um plano GeoMoz com o recurso " + feature + ".")
    module = FEATURE_MODULE.get(feature)
    if module and flags.get(module) is False:
        raise HTTPException(403, "Módulo GeoMoz temporariamente indisponível.")


def user_entitlements(uid):
    database = _db()
    bill = database.collection("billing").document(uid).get()
    state = bill.to_dict() if bill.exists else {}
    plan = _effective_plan(state)
    limits = _limits(plan)
    cycle = current_cycle()
    used = credits_used(state, cycle)
    max_credit = limits["credits"]
    quota = database.collection("billingProcessingQuota").document(uid).get()
    active = (quota.to_dict() or {}).get("activeJobs", {}) if quota.exists else {}
    active = active if isinstance(active, dict) else {}
    epoch = time.time()
    active_count = sum(1 for value in active.values()
                       if isinstance(value, (int, float)) and value > epoch)
    return {
        "plan": plan,
        "features": sorted(PLAN_FEATURES[plan]),
        "periodEnd": state.get("periodEnd") if plan != "community" else None,
        "creditCycle": cycle,
        "creditsUsed": used,
        "creditsLimit": max_credit,
        "creditsRemaining": None if max_credit is None else max(0, max_credit - used),
        "projectsLimit": limits["projects"],
        "storageBytesLimit": limits["storage_bytes"],
        "storageUsedBytes": max(0, int(state.get("storageUsedBytes") or 0)),
        "seatsLimit": limits["seats"],
        "concurrentJobsLimit": limits["concurrent_jobs"],
        "concurrentJobsActive": active_count,
        "managedJobsEnforced": managed_jobs_enforced(),
        "scientificAccessEnforced": scientific_access_enforced(),
        "billingCycle": state.get("billingCycle"),
        "storageEnforced": False,
        "teamSeatsEnforced": False,
        "geeCreditsCharged": False,
    }


@router.get("/me")
def my_entitlements(uid: str = Depends(_uid)):
    return user_entitlements(uid)


def reserve_managed_job(uid, job_id, cost=JOB_CREDIT_COST):
    """Atomically debit managed GDAL credits and reserve a cross-replica slot."""
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("Identificador de trabalho inválido.")
    if type(cost) is not int or cost < 1 or cost > 100:
        raise ValueError("Créditos inválidos.")
    database = _db()
    bill_ref = database.collection("billing").document(uid)
    quota_ref = database.collection("billingProcessingQuota").document(uid)
    event_ref = bill_ref.collection("usageEvents").document(job_id)
    flags = get_features()
    tx = database.transaction()
    epoch = time.time()
    cycle = current_cycle()

    @firestore.transactional
    def reserve(transaction):
        bill_snap = bill_ref.get(transaction=transaction)
        quota_snap = quota_ref.get(transaction=transaction)
        event_snap = event_ref.get(transaction=transaction)
        if event_snap.exists:
            raise HTTPException(409, "O trabalho já possui uma reserva.")
        state = bill_snap.to_dict() if bill_snap.exists else {}
        plan = _effective_plan(state)
        _check_feature(plan, "cloud_jobs", flags)
        limits = _limits(plan)
        used = credits_used(state, cycle)
        cap = limits["credits"]
        if cap is not None and used + cost > cap:
            raise HTTPException(402, "Créditos GeoMoz insuficientes. Consulte os planos.")
        quota = quota_snap.to_dict() if quota_snap.exists else {}
        raw = quota.get("activeJobs") if isinstance(quota, dict) else {}
        raw = raw if isinstance(raw, dict) else {}
        active = {key: value for key, value in raw.items()
                  if isinstance(value, (int, float)) and value > epoch}
        slots = limits["concurrent_jobs"]
        if slots is not None and len(active) >= slots:
            raise HTTPException(429, "Limite de processos simultâneos do plano atingido.")
        active[job_id] = epoch + JOB_LEASE_SECONDS
        transaction.set(event_ref, {
            "type": "managed_gdal", "cost": cost, "cycle": cycle,
            "status": "reserved", "createdAt": firestore.SERVER_TIMESTAMP,
        })
        transaction.set(bill_ref, {
            "creditCycle": cycle, "creditsUsed": used + cost,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        transaction.set(quota_ref, {
            "activeJobs": active, "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return {"plan": plan, "reserved": cost,
                "remaining": None if cap is None else cap - used - cost}

    return reserve(tx)


def finish_managed_job(uid, job_id, *, success):
    """Idempotent finalisation: failed/cancelled jobs refund credits in same cycle."""
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("Identificador de trabalho inválido.")
    db = _db()
    bill_ref = db.collection("billing").document(uid)
    quota_ref = db.collection("billingProcessingQuota").document(uid)
    event_ref = bill_ref.collection("usageEvents").document(job_id)
    tx = db.transaction()

    @firestore.transactional
    def finish(transaction):
        event_snap = event_ref.get(transaction=transaction)
        quota_snap = quota_ref.get(transaction=transaction)
        bill_snap = bill_ref.get(transaction=transaction)
        if not event_snap.exists:
            return False
        event = event_snap.to_dict() or {}
        if event.get("status") != "reserved":
            return False
        current = quota_snap.to_dict() if quota_snap.exists else {}
        active = dict(current.get("activeJobs") or {})
        active.pop(job_id, None)
        transaction.set(quota_ref, {
            "activeJobs": active, "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        update = {"status": "completed" if success else "refunded",
                  "completedAt": firestore.SERVER_TIMESTAMP}
        if not success:
            state = bill_snap.to_dict() if bill_snap.exists else {}
            if state.get("creditCycle") == event.get("cycle"):
                transaction.set(bill_ref, {
                    "creditsUsed": max(0, credits_used(state, event["cycle"]) - int(event["cost"])),
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                }, merge=True)
            update["refundReason"] = "job_not_completed"
        transaction.set(event_ref, update, merge=True)
        return True

    return finish(tx)


def science_plan_required(path, method):
    """No charge for customer-provided GEE credentials; optional access gate."""
    if method != "POST" or not scientific_access_enforced():
        return False
    if path.startswith("/geomoz-api/gee/") and path.split("/")[3] not in (
        "oauth-token", "configure", "oauth", "status",
    ):
        return True
    if path == "/geomoz-api/ai/agent-chat":
        return True
    return False


def ensure_scientific_access(uid):
    bill = _db().collection("billing").document(uid).get()
    state = bill.to_dict() if bill.exists else {}
    plan = _effective_plan(state)
    _check_feature(plan, "scientific_analysis", get_features())
    return plan
