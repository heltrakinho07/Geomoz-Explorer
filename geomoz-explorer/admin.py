"""GeoMoz administrative API.

Only a Firebase ID token whose *server-side current custom claims* include
geomoz_role may enter. There is intentionally no HTTP bootstrap/default admin.
Superuser provisioning is performed out-of-band using Firebase Admin SDK.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from billing import _db, _effective_plan, _utcnow, firebase_auth, firestore
from platform_config import (
    ALLOWED_PLAN_FIELDS,
    DEFAULT_FEATURES,
    DEFAULT_PLANS,
    FEATURE_LABELS,
    get_features,
    read_config,
    update_features,
    update_plan_config,
)

router = APIRouter(prefix="/geomoz-api/admin", tags=["admin"])

ADMIN_ROLES = frozenset(("superadmin", "admin", "support"))
EDIT_ROLES = frozenset(("superadmin", "admin"))


def _require_role(role, allowed):
    if role not in allowed:
        raise HTTPException(403, "Esta operação exige permissões administrativas superiores.")


def require_admin(request: Request):
    """Verify JWT, token revocation, disabled users and CURRENT Firebase claims.

    Reading current Firebase user claims on every administrative request prevents
    an old JWT from retaining administrative access after demotion.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer ") or not header[7:].strip():
        raise HTTPException(401, "Inicie sessão para aceder à administração.")
    if firebase_auth is None:
        raise HTTPException(503, "Autenticação administrativa indisponível.")
    try:
        decoded = firebase_auth.verify_id_token(header[7:].strip(), check_revoked=True)
        uid = str(decoded["uid"])
        account = firebase_auth.get_user(uid)
    except Exception as exc:
        raise HTTPException(401, "Sessão inválida ou expirada.") from exc
    if account.disabled:
        raise HTTPException(403, "A conta está desactivada.")
    claims = account.custom_claims or {}
    role = claims.get("geomoz_role")
    if role not in ADMIN_ROLES:
        raise HTTPException(403, "Acesso exclusivo à administração GeoMoz.")
    return {"uid": uid, "role": role, "email": account.email or ""}


def require_editor(operator=Depends(require_admin)):
    _require_role(operator["role"], EDIT_ROLES)
    return operator


def require_superadmin(operator=Depends(require_admin)):
    _require_role(operator["role"], {"superadmin"})
    return operator


def _audit(operator, action, target, details=None):
    # Audit data contains only stable IDs and operational fields, not secrets.
    _db().collection("adminAudit").document().set({
        "actorUid": operator["uid"],
        "actorRole": operator["role"],
        "action": action,
        "target": target,
        "details": details or {},
        "at": _utcnow().isoformat(),
    })


def _auth_row(account):
    claims = account.custom_claims or {}
    return {
        "uid": account.uid,
        "email": account.email or "",
        "displayName": account.display_name or "",
        "disabled": bool(account.disabled),
        "emailVerified": bool(account.email_verified),
        "role": claims.get("geomoz_role", "user"),
        "createdAt": account.user_metadata.creation_timestamp,
        "lastSignInAt": account.user_metadata.last_sign_in_timestamp,
    }


def _get_account(uid):
    if not uid or len(uid) > 128 or "/" in uid:
        raise HTTPException(400, "UID inválido.")
    try:
        return firebase_auth.get_user(uid)
    except firebase_auth.UserNotFoundError as exc:
        raise HTTPException(404, "Utilizador não encontrado.") from exc


def _protect_operator_target(operator, target, *, allow_self=False):
    if not allow_self and target.uid == operator["uid"]:
        raise HTTPException(403, "Não é permitido alterar a própria conta neste painel.")
    if (target.custom_claims or {}).get("geomoz_role") == "superadmin":
        raise HTTPException(403, "A administração de contas superadmin é externa ao painel.")


@router.get("/me")
def me(operator=Depends(require_admin)):
    return {"uid": operator["uid"], "role": operator["role"],
            "email": operator["email"], "canEdit": operator["role"] in EDIT_ROLES,
            "isSuperadmin": operator["role"] == "superadmin"}


@router.get("/overview")
def overview(operator=Depends(require_admin)):
    # Bounded by 10,000 users. Mark counts as estimates if the ceiling is met.
    count = 0
    for _ in firebase_auth.list_users().iterate_all():
        count += 1
        if count == 10_000:
            break
    records = list(_db().collection("billingPayments").order_by(
        "createdAt", direction=firestore.Query.DESCENDING).limit(100).stream())
    payments = [entry.to_dict() or {} for entry in records]
    by_status = {}
    for payment in payments:
        status = str(payment.get("status", "pending"))
        by_status[status] = by_status.get(status, 0) + 1
    return {
        "users": count, "usersCountExact": count < 10_000,
        "recentPayments": len(payments), "recentPaymentsByStatus": by_status,
        "recentSettledMzn": sum(int(p.get("amountMinor", 0)) for p in payments
                                if p.get("status") == "paid") / 100,
        "billingCheckoutEnabled": __import__("billing")._checkout_enabled(),
        "features": get_features(),
    }


@router.get("/users")
def users(
    limit: int = Query(30, ge=1, le=100),
    page_token: str | None = Query(None, max_length=2048),
    email: str | None = Query(None, max_length=254),
    operator=Depends(require_admin),
):
    if email:
        # Exact search via Firebase Auth; never run unbounded Firestore queries.
        try:
            account = firebase_auth.get_user_by_email(email.strip())
            accounts, next_token = [account], None
        except firebase_auth.UserNotFoundError:
            accounts, next_token = [], None
    else:
        page = firebase_auth.list_users(page_token=page_token, max_results=limit)
        accounts = list(page.users)
        next_token = page.next_page_token
    result = []
    database = _db()
    for account in accounts:
        row = _auth_row(account)
        bill = database.collection("billing").document(account.uid).get()
        data = bill.to_dict() if bill.exists else {}
        row.update({
            "plan": _effective_plan(data),
            "periodEnd": data.get("periodEnd"),
            "academicApproved": data.get("academicApproved") is True,
            "billingStatus": data.get("status", "active"),
        })
        result.append(row)
    return {"users": result, "nextPageToken": next_token}


class UserStatusChange(BaseModel):
    disabled: bool


@router.patch("/users/{uid}/status")
def update_user_status(uid: str, payload: UserStatusChange, operator=Depends(require_superadmin)):
    target = _get_account(uid)
    _protect_operator_target(operator, target)
    firebase_auth.update_user(uid, disabled=payload.disabled)
    if payload.disabled:
        firebase_auth.revoke_refresh_tokens(uid)
    _audit(operator, "user.disabled" if payload.disabled else "user.enabled", uid)
    return {"uid": uid, "disabled": payload.disabled}


class AcademicDecision(BaseModel):
    approved: bool


@router.patch("/users/{uid}/academic")
def update_academic(uid: str, payload: AcademicDecision, operator=Depends(require_editor)):
    target = _get_account(uid)
    _protect_operator_target(operator, target)
    _db().collection("billing").document(uid).set(
        {"academicApproved": payload.approved, "academicReviewedAt": _utcnow().isoformat(),
         "academicReviewedBy": operator["uid"]}, merge=True)
    _audit(operator, "academic.approved" if payload.approved else "academic.revoked", uid)
    return {"uid": uid, "academicApproved": payload.approved}


class GrantPlan(BaseModel):
    plan: Literal["community", "academic", "pro", "teams", "enterprise"]
    through: date | None = None
    reason: str = Field(min_length=5, max_length=300)


def validate_grant(payload: GrantPlan):
    if payload.plan != "community":
        if payload.through is None:
            raise HTTPException(422, "Indique a data final do acesso.")
        today = _utcnow().date()
        if payload.through <= today or payload.through > today + timedelta(days=1096):
            raise HTTPException(422, "A validade deve terminar nos próximos 36 meses.")
    elif payload.through is not None:
        raise HTTPException(422, "O plano Community não necessita de validade.")


@router.patch("/users/{uid}/plan")
def grant_plan(uid: str, payload: GrantPlan, operator=Depends(require_superadmin)):
    validate_grant(payload)
    target = _get_account(uid)
    _protect_operator_target(operator, target)
    record = {
        "plan": payload.plan,
        "status": "active",
        "periodEnd": (
            datetime.combine(payload.through, datetime.min.time(), tzinfo=timezone.utc)
            .replace(hour=23, minute=59, second=59).isoformat()
            if payload.through else None
        ),
        "paymentProvider": "admin_grant",
        # A refund of a previous PayZeno payment must not revoke an independent
        # administrative concession merely because lastPaymentId stayed stale.
        "lastPaymentId": None,
        "billingCycle": None,
        "cancelAtPeriodEnd": False,
        "grantedAt": _utcnow().isoformat(),
        "grantedBy": operator["uid"],
        "grantReason": payload.reason,
    }
    # Atomic entitlement/audit pair avoids an unaudited plan grant.
    database = _db()
    batch = database.batch()
    batch.set(database.collection("billing").document(uid), record, merge=True)
    batch.set(database.collection("adminAudit").document(), {
        "actorUid": operator["uid"], "actorRole": operator["role"],
        "action": "plan.granted", "target": uid,
        "details": {"plan": payload.plan, "through": record["periodEnd"], "reason": payload.reason},
        "at": _utcnow().isoformat(),
    })
    batch.commit()
    return {"uid": uid, "plan": payload.plan, "periodEnd": record["periodEnd"]}


class RoleChange(BaseModel):
    role: Literal["support", "admin", "user"]


@router.patch("/users/{uid}/role")
def update_role(uid: str, payload: RoleChange, operator=Depends(require_superadmin)):
    target = _get_account(uid)
    _protect_operator_target(operator, target)
    claims = dict(target.custom_claims or {})
    if payload.role == "user":
        claims.pop("geomoz_role", None)
    else:
        claims["geomoz_role"] = payload.role
    firebase_auth.set_custom_user_claims(uid, claims)
    firebase_auth.revoke_refresh_tokens(uid)
    _audit(operator, "role.updated", uid, {"role": payload.role})
    return {"uid": uid, "role": payload.role, "reauthenticationRequired": True}


@router.get("/plans")
def list_plans(operator=Depends(require_admin)):
    return read_config(fresh=True)


class PlanChange(BaseModel):
    enabled: bool | None = None
    monthlyMzn: int | None = Field(None, ge=1, le=100_000_000)
    yearlyMzn: int | None = Field(None, ge=1, le=100_000_000)
    projects: int | None = Field(None, ge=0)
    storageBytes: int | None = Field(None, ge=0)
    credits: int | None = Field(None, ge=0)
    seats: int | None = Field(None, ge=0)
    concurrentJobs: int | None = Field(None, ge=0)


@router.patch("/plans/{code}")
def change_plan(code: str, payload: PlanChange, operator=Depends(require_superadmin)):
    changes = payload.model_dump(exclude_unset=True)
    if code not in DEFAULT_PLANS:
        raise HTTPException(404, "Plano desconhecido.")
    if set(changes) - ALLOWED_PLAN_FIELDS:
        raise HTTPException(422, "Campo não suportado.")
    try:
        updated = update_plan_config(code, changes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    _audit(operator, "plan.config_updated", code, {"fields": changes})
    return {"plan": code, "config": updated}


class FeatureChange(BaseModel):
    changes: dict[str, bool] = Field(min_length=1, max_length=15)


@router.patch("/features")
def change_features(payload: FeatureChange, operator=Depends(require_superadmin)):
    try:
        new_flags = update_features(payload.changes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    _audit(operator, "features.updated", "platform", {"changes": payload.changes})
    return {"features": new_flags, "labels": FEATURE_LABELS}


@router.get("/payments")
def payments(
    limit: int = Query(50, ge=1, le=100),
    operator=Depends(require_admin),
):
    docs = _db().collection("billingPayments").order_by(
        "createdAt", direction=firestore.Query.DESCENDING).limit(limit).stream()
    rows = []
    for snap in docs:
        p = snap.to_dict() or {}
        rows.append({
            "id": snap.id, "uid": p.get("uid"),
            "plan": p.get("plan"), "period": p.get("period"),
            "amountMzn": int(p.get("amountMinor", 0)) / 100,
            "currency": p.get("currency", "MZN"),
            "status": p.get("status", "pending"),
            "reference": p.get("reference"),
            "createdAt": p.get("createdAt"), "paidAt": p.get("paidAt"),
        })
    return {"payments": rows}


@router.get("/audit")
def audit(
    limit: int = Query(50, ge=1, le=100),
    operator=Depends(require_admin),
):
    docs = _db().collection("adminAudit").order_by(
        "at", direction=firestore.Query.DESCENDING).limit(limit).stream()
    return {"events": [{"id": snap.id, **(snap.to_dict() or {})} for snap in docs]}
