"""GeoMoz Subscription & Access Engine (phase 1).

Server-side subscription decisions. Never rely on browser plan, claims or prices.
This module does not meter the user's own Google Earth Engine project: EE/FAO
quotas belong to the authenticated Google principal and remain separate from
GeoMoz credits. Only first-party managed processing can consume GeoMoz credits.
"""
from datetime import datetime, timezone
from typing import Final

from fastapi import APIRouter, Depends, HTTPException

from billing import _db, _effective_plan, _uid, _utcnow
from platform_config import get_features, get_plan_limits

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])

PLAN_FEATURES: Final[dict[str, frozenset[str]]] = {
    "community": frozenset({"local_gis"}),
    "academic": frozenset({"local_gis", "scientific_analysis", "cloud_jobs"}),
    "pro": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports"}),
    "teams": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports", "collaboration"}),
    "enterprise": frozenset({"local_gis", "scientific_analysis", "cloud_jobs", "advanced_exports", "collaboration", "institutional_api"}),
}
# Feature flags are controlled by the platform superadmin. A plan cannot
# override a globally disabled module.
FEATURE_MODULES: Final[dict[str, str]] = {
    "local_gis": "gis_workspace",
    "scientific_analysis": "remote_sensing",
    "cloud_jobs": "gis_workspace",
    "advanced_exports": "gis_workspace",
    "collaboration": "gis_workspace",
    "institutional_api": "gis_workspace",
}


def _nonnegative_int(value) -> int:
    return value if type(value) is int and value >= 0 else 0


def resolve_access(billing_state: dict, *, flags: dict, limits: dict | None = None,
                   at: datetime | None = None) -> dict:
    """Pure policy calculator, safe to call in unit tests.

    Paid plan effectiveness is calculated from the authoritative billing
    record (including status and expiry); disabled new sales do not revoke an
    existing paid entitlement. Credit cycles use the current UTC calendar month.
    """
    now = at or _utcnow()
    effective = _effective_plan(billing_state, now=now)
    allowed = PLAN_FEATURES[effective]
    active = {feature: bool(flags.get(FEATURE_MODULES[feature], False)) and feature in allowed
              for feature in PLAN_FEATURES["enterprise"]}
    if limits is None:
        limits = get_plan_limits(effective)
    cycle = now.strftime("%Y-%m")
    used = _nonnegative_int(billing_state.get("creditsUsed")) if billing_state.get("creditCycle") == cycle else 0
    credit_cap = limits.get("credits")
    remaining = None if credit_cap is None else max(0, credit_cap - used)
    storage_used = _nonnegative_int(billing_state.get("storageUsedBytes"))
    return {
        "plan": effective,
        "status": "active" if effective == "community" and billing_state.get("plan") != "community"
                  else billing_state.get("status", "active"),
        "periodEnd": billing_state.get("periodEnd"),
        "features": active,
        "modules": {name: bool(flag) for name, flag in flags.items()},
        "limits": limits,
        "usage": {
            "creditCycle": cycle, "creditsUsed": used, "creditsRemaining": remaining,
            "storageUsedBytes": storage_used,
            # Until uploads use server-enforced storage allocation, this number
            # is indicative only. Do not describe it as an enforced hard cap.
            "storageQuotaEnforced": False,
            "projectsUsed": None,
            "projectCountVerified": False,
            "concurrentJobsUsed": None,
            "concurrentQuotaScope": "instance",
        },
        "automaticRenewal": False,
        "earthEngineQuota": "external-user-owned",
    }


def load_access(uid: str) -> dict:
    """Fetch server-owned billing and quota records; never trust client fields."""
    if not uid or "/" in uid or len(uid) > 128:
        raise HTTPException(401, "Conta inválida.")
    database = _db()
    bill_snap = database.collection("billing").document(uid).get()
    state = bill_snap.to_dict() if bill_snap.exists else {}
    flags = get_features()
    access = resolve_access(state, flags=flags)
    quota_snap = database.collection("billingProjectQuota").document(uid).get()
    if quota_snap.exists:
        count = (quota_snap.to_dict() or {}).get("count")
        if type(count) is int and count >= 0:
            access["usage"]["projectsUsed"] = count
            access["usage"]["projectCountVerified"] = True
    return access


def require_subscription_feature(uid: str, feature: str, *, access: dict | None = None) -> dict:
    """Server-side feature gate, not a frontend hint. Fail closed."""
    if feature not in PLAN_FEATURES["enterprise"]:
        raise ValueError("Funcionalidade desconhecida.")
    result = access if access is not None else load_access(uid)
    if not result["features"].get(feature):
        raise HTTPException(
            status_code=402, detail={
                "code": "PLAN_UPGRADE_REQUIRED",
                "feature": feature,
                "plan": result["plan"],
                "message": "Esta operação não está incluída no seu plano GeoMoz. Consulte /planos.",
            })
    return result


@router.get("/access")
def get_my_access(uid: str = Depends(_uid)):
    return load_access(uid)
