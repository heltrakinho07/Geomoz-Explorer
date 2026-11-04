"""Authoritative GeoMoz billing API backed by Firestore Admin SDK.

Payments are NEVER activated on a browser redirect or user-supplied status.
Stripe Checkout is optional; M-Pesa/E-Mola orders remain pending until an
approved, authenticated partner callback has been integrated.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr

from billing_core import PLANS, current_plan, monthly_cycle, period_end, public_catalogue, remaining_credits, utcnow
from billing_auth import require_billing_auth

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])


def _db():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception as exc:
        raise HTTPException(503, "Facturação temporariamente indisponível (Firestore Admin).") from exc


def _account(uid: str) -> dict:
    snapshot = _db().collection("billing_accounts").document(uid).get()
    return snapshot.to_dict() or {}


def _safe_origin() -> str:
    origin = os.getenv("BILLING_FRONTEND_URL", "https://geomoz.geolithica.com").rstrip("/")
    if not origin.startswith("https://") and not origin.startswith("http://localhost"):
        raise HTTPException(503, "BILLING_FRONTEND_URL tem de ser HTTPS.")
    return origin


def _require_admin(uid: str) -> None:
    admins = {v.strip() for v in os.getenv("BILLING_ADMIN_UIDS", "").split(",") if v.strip()}
    if uid not in admins:
        raise HTTPException(403, "Acção reservada à administração.")


def _iso_now() -> str:
    return utcnow().isoformat()


def _confirm_paid_order(order_id: str, event_id: str, provider: str, amount_mzn: int, payment_ref: str) -> bool:
    """Single atomic payment-to-entitlement transition; replay-safe."""
    from firebase_admin import firestore
    db = _db()
    order_ref = db.collection("billing_orders").document(order_id)
    event_ref = db.collection("billing_events").document(hashlib.sha256((provider + ":" + event_id).encode()).hexdigest())
    txn = db.transaction()

    @firestore.transactional
    def apply(tx):
        event_snap = event_ref.get(transaction=tx)
        order_snap = order_ref.get(transaction=tx)
        if event_snap.exists:
            return False
        if not order_snap.exists:
            raise HTTPException(404, "Encomenda não encontrada.")
        order = order_snap.to_dict() or {}
        if order.get("provider") != provider or order.get("amount_mzn") != amount_mzn:
            raise HTTPException(400, "Incompatibilidade entre a encomenda e o pagamento.")
        if order.get("status") == "paid":
            tx.set(event_ref, {"received_at": _iso_now(), "order_id": order_id})
            return False
        if order.get("status") != "pending":
            raise HTTPException(409, "A encomenda não pode ser confirmada.")
        uid = order["uid"]
        account_ref = db.collection("billing_accounts").document(uid)
        account_snap = account_ref.get(transaction=tx)
        account = account_snap.to_dict() or {}
        if order["plan"] == "academic" and not account.get("academic_verified", False):
            raise HTTPException(403, "Validação académica pendente.")
        now = utcnow()
        expires = period_end(now, order["interval"])
        tx.set(account_ref, {
            "plan": order["plan"], "status": "active", "interval": order["interval"],
            "activated_at": now.isoformat(), "expires_at": expires.isoformat(),
            "credits_cycle": monthly_cycle(now), "credits_used": 0,
            "latest_order_id": order_id, "updated_at": now.isoformat(),
        }, merge=True)
        tx.update(order_ref, {"status": "paid", "paid_at": now.isoformat(), "provider_reference": payment_ref})
        tx.set(event_ref, {"received_at": now.isoformat(), "order_id": order_id, "provider": provider})
        return True

    return apply(txn)


@router.get("/plans")
def list_plans():
    return {"plans": public_catalogue(), "currency": "MZN", "billing_mode": "prepaid_non_renewing"}


@router.get("/me")
def current_subscription(uid: str = Depends(require_billing_auth)):
    account = _account(uid)
    plan_id = current_plan(account)
    tier = PLANS[plan_id]
    db = _db()
    # Count actual cloud projects, never trust browser-provided numbers.
    project_count = sum(1 for _ in db.collection("users").document(uid).collection("projects").stream())
    cycle = monthly_cycle()
    used = int(account.get("credits_used", 0)) if account.get("credits_cycle") == cycle else 0
    orders = db.collection("billing_orders").where("uid", "==", uid).limit(20).stream()
    latest_orders = sorted(
        [{"id": d.id, **(d.to_dict() or {})} for d in orders],
        key=lambda item: item.get("created_at", ""), reverse=True,
    )[:10]
    return {
        "plan": plan_id, "plan_details": {"id": plan_id, **tier},
        "status": "active" if plan_id != "community" else "community",
        "expires_at": account.get("expires_at") if plan_id != "community" else None,
        "academic_verified": bool(account.get("academic_verified", False)),
        "academic_request_status": account.get("academic_request_status"),
        "usage": {"cycle": cycle, "credits_used": used, "credits_remaining": remaining_credits(account),
                  "projects": project_count, "projects_limit": tier["projects"]},
        "orders": latest_orders,
    }


class CheckoutRequest(BaseModel):
    plan: Literal["academic", "pro", "teams"]
    interval: Literal["month", "year"]
    provider: Literal["stripe", "mpesa", "emola"]


def _stripe_checkout(order_id: str, plan: str, amount_mzn: int) -> tuple[str, str]:
    secret = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not secret:
        raise HTTPException(503, "Pagamento por cartão ainda não está configurado.")
    origin = _safe_origin()
    fields = {
        "mode": "payment",
        "success_url": origin + "/planos?checkout=processing",
        "cancel_url": origin + "/planos?checkout=cancelled",
        "client_reference_id": order_id,
        "metadata[geomoz_order_id]": order_id,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": os.getenv("STRIPE_CURRENCY", "mzn").lower(),
        "line_items[0][price_data][unit_amount]": str(amount_mzn * 100),
        "line_items[0][price_data][product_data][name]": PLANS[plan]["name"],
    }
    req = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=urllib.parse.urlencode(fields).encode(),
        headers={"Authorization": "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            payload = json.load(response)
        if not payload.get("url") or not payload.get("id"):
            raise ValueError("Stripe não devolveu o link de pagamento.")
        return payload["id"], payload["url"]
    except (urllib.error.URLError, ValueError) as exc:
        raise HTTPException(502, "Não foi possível iniciar o checkout. Verifique a moeda e a configuração do gateway.") from exc


@router.post("/checkout")
def checkout(body: CheckoutRequest, uid: str = Depends(require_billing_auth)):
    account = _account(uid)
    if body.plan == "academic" and not account.get("academic_verified"):
        raise HTTPException(403, "Solicite a validação académica antes de aderir ao Academic.")
    if body.provider == "stripe" and not os.getenv("STRIPE_SECRET_KEY"):
        raise HTTPException(503, "Stripe não está configurado. Escolha outro método.")
    amount_mzn = PLANS[body.plan]["monthly_mzn" if body.interval == "month" else "annual_mzn"]
    order_id = uuid4().hex
    db = _db()
    ref = db.collection("billing_orders").document(order_id)
    ref.set({
        "uid": uid, "plan": body.plan, "interval": body.interval, "amount_mzn": amount_mzn,
        "currency": "MZN", "provider": body.provider, "status": "pending", "created_at": _iso_now(),
    })
    if body.provider == "stripe":
        try:
            session_id, checkout_url = _stripe_checkout(order_id, body.plan, amount_mzn)
            ref.update({"provider_session_id": session_id})
            return {"order_id": order_id, "status": "pending", "checkout_url": checkout_url}
        except HTTPException:
            ref.update({"status": "gateway_error"})
            raise
    # No fabricated payments, transfer instructions or unverified activations.
    return {
        "order_id": order_id, "status": "pending", "checkout_url": None,
        "message": "Pedido registado. A referência de pagamento será disponibilizada após integração contratual do gateway. O plano ainda não está activo.",
    }


def _verify_stripe_signature(raw: bytes, header: str, secret: str) -> None:
    values = {}
    for item in header.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            values.setdefault(k.strip(), []).append(v.strip())
    try:
        ts = int(values["t"][0])
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, "Assinatura Stripe malformada.") from exc
    if abs(time.time() - ts) > 300:
        raise HTTPException(400, "Webhook Stripe fora do intervalo permitido.")
    expected = hmac.new(secret.encode(), str(ts).encode() + b"." + raw, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in values.get("v1", [])):
        raise HTTPException(401, "Assinatura Stripe inválida.")


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, stripe_signature: str = Header(default="", alias="Stripe-Signature")):
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Webhook Stripe não configurado.")
    raw = await request.body()
    _verify_stripe_signature(raw, stripe_signature, secret)
    payload = json.loads(raw)
    if payload.get("type") != "checkout.session.completed":
        return {"received": True}
    session = payload.get("data", {}).get("object", {})
    if session.get("payment_status") != "paid":
        return {"received": True}
    order_id = session.get("client_reference_id")
    if not order_id or not isinstance(order_id, str):
        raise HTTPException(400, "Encomenda Stripe ausente.")
    order_snap = _db().collection("billing_orders").document(order_id).get()
    if not order_snap.exists:
        raise HTTPException(404, "Encomenda desconhecida.")
    order = order_snap.to_dict() or {}
    if session.get("id") != order.get("provider_session_id"):
        raise HTTPException(400, "Sessão Stripe não corresponde à encomenda.")
    if session.get("currency", "").lower() != os.getenv("STRIPE_CURRENCY", "mzn").lower():
        raise HTTPException(400, "Moeda inesperada.")
    if int(session.get("amount_total") or -1) != int(order["amount_mzn"]) * 100:
        raise HTTPException(400, "Valor inesperado.")
    applied = _confirm_paid_order(order_id, str(payload.get("id")), "stripe",
                                  int(order["amount_mzn"]), session["id"])
    return {"received": True, "activated": applied}


@router.post("/webhooks/partner")
async def partner_webhook(request: Request):
    """Internal adapter endpoint. Not a native M-Pesa or E-Mola implementation.

    A trusted adapter MUST verify provider authenticity before signing the raw
    callback with BILLING_PARTNER_WEBHOOK_SECRET.
    """
    secret = os.getenv("BILLING_PARTNER_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Adaptador de pagamentos não configurado.")
    raw = await request.body()
    try:
        ts = int(request.headers.get("X-GeoMoz-Timestamp", ""))
    except ValueError as exc:
        raise HTTPException(400, "Timestamp inválido.") from exc
    if abs(time.time() - ts) > 300:
        raise HTTPException(401, "Callback expirado.")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-GeoMoz-Signature", "")):
        raise HTTPException(401, "Assinatura inválida.")
    body = json.loads(raw)
    if body.get("provider") not in ("mpesa", "emola") or body.get("status") != "paid":
        return {"received": True, "activated": False}
    if not all(body.get(k) for k in ("event_id", "order_id", "provider_reference")):
        raise HTTPException(400, "Campos do callback em falta.")
    applied = _confirm_paid_order(
        str(body["order_id"]), str(body["event_id"]), str(body["provider"]),
        int(body.get("amount_mzn", -1)), str(body["provider_reference"])
    )
    return {"received": True, "activated": applied}


class AcademicRequest(BaseModel):
    institution: str = Field(min_length=2, max_length=180)
    institutional_email: str = Field(min_length=5, max_length=254)


@router.post("/academic-request")
def academic_request(body: AcademicRequest, uid: str = Depends(require_billing_auth)):
    db = _db()
    db.collection("billing_academic_requests").document(uid).set({
        "uid": uid, "institution": body.institution.strip(),
        "institutional_email": body.institutional_email.strip().lower(),
        "status": "pending", "requested_at": _iso_now(),
    })
    db.collection("billing_accounts").document(uid).set({"academic_request_status": "pending"}, merge=True)
    return {"status": "pending", "message": "Pedido submetido para validação académica."}


class AcademicDecision(BaseModel):
    approved: bool


@router.post("/admin/academic/{target_uid}")
def review_academic(target_uid: str, body: AcademicDecision, uid: str = Depends(require_billing_auth)):
    _require_admin(uid)
    db = _db()
    db.collection("billing_accounts").document(target_uid).set({
        "academic_verified": body.approved, "academic_request_status": "approved" if body.approved else "rejected",
        "academic_reviewed_at": _iso_now(), "academic_reviewed_by": uid,
    }, merge=True)
    db.collection("billing_academic_requests").document(target_uid).set(
        {"status": "approved" if body.approved else "rejected"}, merge=True)
    return {"approved": body.approved}


class EnterpriseRequest(BaseModel):
    organisation: str = Field(min_length=2, max_length=180)
    contact_email: str = Field(min_length=5, max_length=254)
    message: str = Field(default="", max_length=2000)


@router.post("/enterprise-request")
def enterprise_request(body: EnterpriseRequest, uid: str = Depends(require_billing_auth)):
    ref = _db().collection("billing_enterprise_requests").document()
    ref.set({**body.model_dump(), "uid": uid, "status": "pending", "created_at": _iso_now()})
    return {"status": "pending", "request_id": ref.id}


class MeteredUsage(BaseModel):
    uid: str = Field(min_length=1, max_length=128)
    operation_id: str = Field(min_length=8, max_length=160, pattern=r"^[a-zA-Z0-9_:-]+$")
    credits: int = Field(ge=1, le=100000)
    kind: str = Field(min_length=2, max_length=120)


@router.post("/internal/consume")
def consume_credits(body: MeteredUsage, x_geomoz_metering_secret: str = Header(default="", alias="X-GeoMoz-Metering-Secret")):
    """Backend-only idempotent debit; never callable with a browser Firebase token."""
    secret = os.getenv("BILLING_METERING_SECRET", "")
    if not secret or not hmac.compare_digest(x_geomoz_metering_secret, secret):
        raise HTTPException(403, "Acesso de serviço negado.")
    from firebase_admin import firestore
    db = _db()
    account_ref = db.collection("billing_accounts").document(body.uid)
    usage_ref = account_ref.collection("usage_events").document(body.operation_id)
    txn = db.transaction()

    @firestore.transactional
    def record(tx):
        account_snap = account_ref.get(transaction=tx)
        event_snap = usage_ref.get(transaction=tx)
        if event_snap.exists:
            existing = event_snap.to_dict() or {}
            if existing.get("credits") != body.credits or existing.get("kind") != body.kind:
                raise HTTPException(409, "A operação já existe com outros parâmetros.")
            return {"status": "already_recorded", "remaining": existing.get("remaining")}
        account = account_snap.to_dict() or {}
        key = current_plan(account)
        limit = PLANS[key]["credits"]
        if limit is None:
            raise HTTPException(503, "Quota Enterprise requer configuração institucional.")
        cycle = monthly_cycle()
        used = int(account.get("credits_used", 0)) if account.get("credits_cycle") == cycle else 0
        if used + body.credits > limit:
            raise HTTPException(402, "Créditos insuficientes para esta operação.")
        remaining = limit - used - body.credits
        tx.set(account_ref, {"credits_used": used + body.credits, "credits_cycle": cycle,
                             "updated_at": _iso_now()}, merge=True)
        tx.set(usage_ref, {"credits": body.credits, "kind": body.kind, "cycle": cycle,
                           "remaining": remaining, "created_at": _iso_now()})
        return {"status": "recorded", "remaining": remaining}

    return record(txn)
