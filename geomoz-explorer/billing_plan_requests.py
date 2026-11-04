"""Subscription requests, without creating a charge or granting entitlements.

Used while checkout remains disabled and for eligibility/institutional enquiries.
Every request is owned by an authenticated Firebase principal, server-side.
"""
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from billing import _db, _iso, _uid, _utcnow, firebase_auth, firestore
from platform_config import get_plan_config
from admin import require_admin, require_editor

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])
admin_router = APIRouter(prefix="/geomoz-api/admin", tags=["admin"])

PlanId = Literal["academic", "pro", "teams", "enterprise"]
Period = Literal["monthly", "yearly"]


class PlanRequest(BaseModel):
    plan: PlanId
    period: Period = "monthly"
    message: str = Field(default="", max_length=1000)


def validate_request(payload: PlanRequest):
    if not get_plan_config(payload.plan)["enabled"]:
        raise HTTPException(403, "Este plano está temporariamente indisponível.")
    if payload.plan == "enterprise" and len(payload.message.strip()) < 8:
        raise HTTPException(422, "Descreva brevemente a necessidade da organização.")
    return payload


def public_request(row):
    if not row:
        return None
    return {key: row.get(key) for key in (
        "uid", "email", "name", "plan", "period", "message",
        "status", "submittedAt", "updatedAt", "reviewedAt"
    )}


@router.post("/requests", status_code=200)
def submit_request(payload: PlanRequest, uid: str = Depends(_uid)):
    validate_request(payload)
    if firebase_auth is None or firestore is None:
        raise HTTPException(503, "Gestão de adesões indisponível.")
    try:
        user = firebase_auth.get_user(uid)
    except Exception as exc:
        raise HTTPException(401, "Conta de utilizador inválida.") from exc
    if user.disabled or not user.email:
        raise HTTPException(403, "Confirme o e-mail da sua conta antes de solicitar um plano.")
    database = _db()
    doc = database.collection("billingPlanRequests").document(uid)
    now = _utcnow()
    transaction = database.transaction()

    @firestore.transactional
    def store(tx):
        snap = doc.get(transaction=tx)
        prior = snap.to_dict() if snap.exists else {}
        same = (prior.get("plan") == payload.plan and prior.get("period") == payload.period
                and prior.get("status") in ("pending", "in_review"))
        if same:
            return prior
        if time.time() - float(prior.get("submittedEpoch") or 0) < 600:
            raise HTTPException(429, "Já existe um pedido recente. Tente novamente mais tarde.")
        record = {
            "uid": uid, "email": user.email, "name": user.display_name or "",
            "plan": payload.plan, "period": payload.period,
            "message": payload.message.strip(), "status": "pending",
            "submittedAt": _iso(now), "updatedAt": _iso(now),
            "submittedEpoch": time.time(), "reviewedAt": None,
        }
        tx.set(doc, record)
        return record

    return {"request": public_request(store(transaction)), "paymentRequiredNow": False}


@router.get("/requests/me")
def my_request(uid: str = Depends(_uid)):
    snap = _db().collection("billingPlanRequests").document(uid).get()
    return {"request": public_request(snap.to_dict() if snap.exists else None)}


@admin_router.get("/plan-requests")
def admin_requests(limit: int = Query(80, ge=1, le=100), operator=Depends(require_admin)):
    docs = _db().collection("billingPlanRequests").order_by(
        "submittedEpoch", direction=firestore.Query.DESCENDING
    ).limit(limit).stream()
    return {"requests": [public_request(doc.to_dict()) for doc in docs]}


class ReviewRequest(BaseModel):
    status: Literal["in_review", "completed", "declined"]


@admin_router.patch("/plan-requests/{uid}")
def review_request(uid: str, payload: ReviewRequest, operator=Depends(require_editor)):
    if not uid or len(uid) > 128 or "/" in uid:
        raise HTTPException(400, "UID inválido.")
    database = _db()
    doc = database.collection("billingPlanRequests").document(uid)
    snap = doc.get()
    if not snap.exists:
        raise HTTPException(404, "Pedido não encontrado.")
    previous = snap.to_dict() or {}
    if previous.get("status") == payload.status:
        return {"request": public_request(previous)}
    # Reviewer acknowledgement does not activate any paid plan.
    now = _iso(_utcnow())
    batch = database.batch()
    batch.set(doc, {"status": payload.status, "updatedAt": now,
                    "reviewedAt": now, "reviewedBy": operator["uid"]}, merge=True)
    batch.set(database.collection("adminAudit").document(), {
        "actorUid": operator["uid"], "actorRole": operator["role"],
        "action": "plan_request.reviewed", "target": uid,
        "details": {"plan": previous.get("plan"), "status": payload.status},
        "at": now,
    })
    batch.commit()
    return {"request": public_request({**previous, "status": payload.status,
                                        "updatedAt": now, "reviewedAt": now})}
