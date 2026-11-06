"""GeoMoz subscription entitlements: server-authoritative access and usage view.

Read billing/{uid} on every check; never trust frontend plan or custom fields.
This module does not introduce a second ledger, a second credit balance, or
implicitly activate enforcement on existing public GIS endpoints.
"""
import os

from fastapi import APIRouter, Depends, HTTPException

from billing import _credit_usage, _db, _effective_plan, _uid, _utcnow
from platform_config import get_features, get_plan_limits

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])

# Labels mirror the existing React plans catalogue. Enforcement is separate:
# advertised features whose underlying service is not yet provisioned remain
# explicitly marked as provisional in the API payload.
PLAN_FEATURES = {
    "community": ("local_gis",),
    "academic": ("local_gis", "scientific_analysis", "cloud_jobs"),
    "pro": ("local_gis", "scientific_analysis", "cloud_jobs", "gee_terrain_pro", "advanced_exports"),
    "teams": ("local_gis", "scientific_analysis", "cloud_jobs", "gee_terrain_pro", "advanced_exports", "collaboration"),
    "enterprise": ("local_gis", "scientific_analysis", "cloud_jobs", "gee_terrain_pro", "advanced_exports", "collaboration", "institutional_api"),
}
UNPROVISIONED = frozenset({"collaboration", "institutional_api"})
MODULE_FLAGS = {
    "local_gis": "gis_workspace",
    "scientific_analysis": "remote_sensing",
    "gee_terrain_pro": "terrain_3d",
}
LIMIT_STATUS = {"projects": "enforced", "credits": "opt_in", "storage": "not_enforced",
                "seats": "not_enforced", "concurrentJobs": "not_enforced"}


def access_matrix(plan, flags):
    allowed = PLAN_FEATURES.get(plan, PLAN_FEATURES["community"])
    return {
        feature: {
            "included": feature in allowed,
            "available": feature in allowed and flags.get(MODULE_FLAGS.get(feature, ""), True)
            and feature not in UNPROVISIONED,
            "provisioning": "pending" if feature in UNPROVISIONED else "available",
        }
        for feature in PLAN_FEATURES["enterprise"]
    }


def require_plan_feature(uid, feature):
    """Optional gate for a known paid operation, without any client authority."""
    if feature not in PLAN_FEATURES["enterprise"]:
        raise HTTPException(500, "Funcionalidade sem política de acesso.")
    snap = _db().collection("billing").document(uid).get()
    plan = _effective_plan(snap.to_dict() if snap.exists else {})
    entitled = access_matrix(plan, get_features())[feature]
    if not entitled["available"]:
        raise HTTPException(403, "O seu plano não permite esta funcionalidade. Consulte /planos.")
    return plan


def processing_gate_enabled():
    return os.getenv("GEOMOZ_ENFORCE_PROCESSING_PLAN", "false").strip().lower() == "true"


def user_subscription_snapshot(uid, database=None):
    db = database if database is not None else _db()
    snap = db.collection("billing").document(uid).get()
    state = snap.to_dict() if snap.exists else {}
    plan = _effective_plan(state)
    limits = get_plan_limits(plan)
    usage = _credit_usage(state, limits["credits"], _utcnow())
    projects = db.collection("users").document(uid).collection("projects")
    count = projects.count().get()[0][0].value
    storage = max(0, int(state.get("storageUsedBytes", 0) or 0))
    remaining_projects = None if limits["projects"] is None else max(0, limits["projects"] - count)
    return {
        "plan": plan,
        "subscriptionStatus": state.get("status", "active"),
        "periodEnd": state.get("periodEnd") if plan != "community" else None,
        "automaticRenewal": False,
        "limits": {
            "projects": limits["projects"], "credits": limits["credits"],
            "storageBytes": limits["storage_bytes"], "seats": limits["seats"],
            "concurrentJobs": limits["concurrent_jobs"],
        },
        "usage": {
            "projects": count, "projectsRemaining": remaining_projects,
            "storageBytes": storage, "storageVerified": False,
            "credits": usage["creditsUsed"], "creditsReserved": usage["creditsReserved"],
            "creditsRemaining": usage["remainingCredits"],
            "creditCycle": usage["creditCycle"], "creditResetAt": usage["creditResetAt"],
        },
        "features": access_matrix(plan, get_features()),
        "enforcement": {
            **LIMIT_STATUS,
            "credits": "enforced" if os.getenv("GEOMOZ_ENFORCE_AI_CREDITS", "false").strip().lower() == "true" else "opt_in",
            "cloudJobsPlan": "enforced" if processing_gate_enabled() else "opt_in",
        },
    }


@router.get("/entitlements")
def subscription_entitlements(uid: str = Depends(_uid)):
    return user_subscription_snapshot(uid)
