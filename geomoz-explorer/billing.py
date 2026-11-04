"""Server-owned GeoMoz subscriptions. Stripe is optional until configured.
Never infer entitlements from a browser redirect or an unverified payment request.
"""
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from firebase_admin import firestore

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])

PLAN_LIMITS = {
    "community": {"projects": 3, "storage_bytes": 536870912, "credits": 20, "seats": 1, "concurrent_jobs": 1},
    "academic": {"projects": 15, "storage_bytes": 5368709120, "credits": 150, "seats": 1, "concurrent_jobs": 1},
    "pro": {"projects": 75, "storage_bytes": 32212254720, "credits": 800, "seats": 1, "concurrent_jobs": 2},
    "teams": {"projects": 200, "storage_bytes": 161061273600, "credits": 3000, "seats": 5, "concurrent_jobs": 5},
    "enterprise": {"projects": None, "storage_bytes": None, "credits": None, "seats": None, "concurrent_jobs": None},
}
PRICES = {
    ("academic", "monthly"): 299, ("academic", "yearly"): 2990,
    ("pro", "monthly"): 1199, ("pro", "yearly"): 11990,
    ("teams", "monthly"): 4999, ("teams", "yearly"): 49990,
}
FREE = {"plan": "community", "status": "active", "creditsUsed": 0, "storageUsedBytes": 0}

def _db():
    try:
        return firestore.client()
    except Exception as exc:
        raise HTTPException(503, "O serviço de facturação está indisponível.") from exc

def _stripe_key():
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(503, "Pagamento por cartão ainda não configurado.")
    return key

async def _stripe_post(path: str, data: dict):
    headers = {"Authorization": f"Bearer {_stripe_key()}"}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://api.stripe.com/v1/" + path, headers=headers, data=data)
    if response.status_code >= 400:
        raise HTTPException(502, "O fornecedor de pagamentos não conseguiu concluir a operação.")
    return response.json()

def _verified_uid(request: Request):
    # Import lazily to share the application's existing token-verification function.
    from api import _extract_uid_from_header
    uid = _extract_uid_from_header(request.headers.get("Authorization", ""))
    if not uid:
        raise HTTPException(401, "Autenticação Firebase necessária.")
    return uid

def _subscription_snapshot(uid: str):
    snapshot = _db().collection("billing").document(uid).get()
    return snapshot.to_dict() if snapshot.exists else dict(FREE)

@router.get("/me")
def get_billing(uid: str = Depends(_verified_uid)):
    state = _subscription_snapshot(uid)
    status = state.get("status", "active")
    plan = state.get("plan", "community") if status in ("active", "trialing") else "community"
    if plan not in PLAN_LIMITS:
        plan = "community"
    return {"plan": plan, "status": status, "periodEnd": state.get("periodEnd"),
            "creditsUsed": state.get("creditsUsed", 0), "storageUsedBytes": state.get("storageUsedBytes", 0),
            "limits": PLAN_LIMITS[plan], "cancelAtPeriodEnd": state.get("cancelAtPeriodEnd", False)}

class CheckoutRequest(BaseModel):
    plan: str
    period: str

@router.post("/checkout")
async def create_checkout(payload: CheckoutRequest, uid: str = Depends(_verified_uid)):
    pair = (payload.plan, payload.period)
    if pair not in PRICES:
        raise HTTPException(400, "Plano ou periodicidade inválidos.")
    state = _subscription_snapshot(uid)
    if payload.plan == "academic" and not state.get("academicApproved"):
        raise HTTPException(403, "A elegibilidade académica ainda não foi validada.")
    key = f"STRIPE_PRICE_{payload.plan.upper()}_{payload.period.upper()}"
    price = os.environ.get(key)
    if not price:
        raise HTTPException(503, "O preço ainda não foi configurado no gateway.")
    base = os.environ.get("GEOMOZ_PUBLIC_URL", "https://geomoz.geolithica.com").rstrip("/")
    data = {
        "mode": "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1",
        "success_url": base + "/planos?checkout=success",
        "cancel_url": base + "/planos?checkout=cancel",
        "client_reference_id": uid,
        "metadata[uid]": uid, "metadata[plan]": payload.plan, "metadata[period]": payload.period,
        "subscription_data[metadata][uid]": uid,
        "subscription_data[metadata][plan]": payload.plan,
        "subscription_data[metadata][period]": payload.period,
    }
    result = await _stripe_post("checkout/sessions", data)
    url = result.get("url", "")
    if not url.startswith("https://checkout.stripe.com/"):
        raise HTTPException(502, "O gateway não devolveu uma sessão válida.")
    return {"url": url}

@router.post("/portal")
async def create_portal(uid: str = Depends(_verified_uid)):
    state = _subscription_snapshot(uid)
    customer = state.get("stripeCustomerId")
    if not customer:
        raise HTTPException(404, "Não existe uma subscrição Stripe associada.")
    base = os.environ.get("GEOMOZ_PUBLIC_URL", "https://geomoz.geolithica.com").rstrip("/")
    result = await _stripe_post("billing_portal/sessions", {"customer": customer, "return_url": base + "/planos"})
    return {"url": result["url"]}

def _verify_webhook(raw: bytes, signature: str):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Webhook Stripe não configurado.")
    values = {}
    for item in signature.split(","):
        if "=" in item:
            k, v = item.strip().split("=", 1)
            values.setdefault(k, []).append(v)
    try:
        timestamp = int(values["t"][0])
    except (KeyError, ValueError, IndexError):
        raise HTTPException(400, "Assinatura inválida.")
    if abs(time.time() - timestamp) > 300:
        raise HTTPException(400, "Webhook expirado.")
    digest = hmac.new(secret.encode(), str(timestamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(digest, value) for value in values.get("v1", [])):
        raise HTTPException(400, "Assinatura inválida.")

@router.post("/webhook")
async def stripe_webhook(request: Request):
    raw = await request.body()
    _verify_webhook(raw, request.headers.get("stripe-signature", ""))
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Evento inválido.")
    event_id = event.get("id")
    kind = event.get("type")
    obj = event.get("data", {}).get("object", {})
    if not isinstance(event_id, str) or not event_id.startswith("evt_"):
        raise HTTPException(400, "Identificador inválido.")
    if kind not in ("checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"):
        return {"received": True}
    metadata = obj.get("metadata", {}) or {}
    uid = metadata.get("uid") or (obj.get("client_reference_id") if kind == "checkout.session.completed" else None)
    plan = metadata.get("plan")
    if not isinstance(uid, str) or not uid or plan not in ("academic", "pro", "teams"):
        raise HTTPException(400, "Metadados da subscrição inválidos.")
    if kind == "checkout.session.completed":
        if obj.get("mode") != "subscription" or obj.get("payment_status") != "paid":
            return {"received": True}
        changes = {"plan": plan, "status": "active", "stripeCustomerId": obj.get("customer"),
                   "stripeSubscriptionId": obj.get("subscription"), "cancelAtPeriodEnd": False}
    else:
        stripe_status = obj.get("status", "cancelled")
        allowed = {"active", "trialing", "past_due", "cancelled", "incomplete", "unpaid"}
        if stripe_status not in allowed:
            stripe_status = "expired"
        changes = {"plan": plan, "status": stripe_status,
                   "stripeCustomerId": obj.get("customer"),
                   "stripeSubscriptionId": obj.get("id"),
                   "cancelAtPeriodEnd": bool(obj.get("cancel_at_period_end", False)),
                   "periodEnd": datetime.fromtimestamp(obj["current_period_end"], timezone.utc).isoformat() if isinstance(obj.get("current_period_end"), int) else None}
        if kind == "customer.subscription.deleted":
            changes["status"] = "cancelled"
    database = _db()
    event_ref = database.collection("billingEvents").document(event_id)
    billing_ref = database.collection("billing").document(uid)
    transaction = database.transaction()
    @firestore.transactional
    def apply(tx):
        if event_ref.get(transaction=tx).exists:
            return False
        tx.set(event_ref, {"kind": kind, "uid": uid, "processedAt": firestore.SERVER_TIMESTAMP})
        tx.set(billing_ref, {**changes, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return True
    apply(transaction)
    return {"received": True}


def charge_managed_cloud_credits(uid: str, cost: int, operation_id: str) -> dict:
    """Atomic, idempotent charge to call ONLY from trusted backend job workers.

    Each monthly credit cycle is UTC; BYO Earth Engine requests must not call this.
    This method is deliberately not exposed as a browser-callable endpoint.
    """
    if not isinstance(cost, int) or cost <= 0 or cost > 100000:
        raise ValueError("O custo deve ser um inteiro positivo válido.")
    if not operation_id or len(operation_id) > 160 or "/" in operation_id:
        raise ValueError("Identificador de operação inválido.")
    database = _db()
    billing_ref = database.collection("billing").document(uid)
    operation_ref = billing_ref.collection("usageEvents").document(operation_id)
    transaction = database.transaction()
    current_cycle = datetime.now(timezone.utc).strftime("%Y-%m")

    @firestore.transactional
    def debit(tx):
        if operation_ref.get(transaction=tx).exists:
            return {"alreadyCharged": True}
        snap = billing_ref.get(transaction=tx)
        state = snap.to_dict() if snap.exists else dict(FREE)
        plan = state.get("plan", "community")
        if state.get("status", "active") not in ("active", "trialing"):
            plan = "community"
        if plan not in PLAN_LIMITS:
            plan = "community"
        limit = PLAN_LIMITS[plan]["credits"]
        credits_used = int(state.get("creditsUsed", 0) or 0) if state.get("creditCycle") == current_cycle else 0
        if limit is not None and credits_used + cost > limit:
            raise HTTPException(402, "Créditos insuficientes para a operação cloud.")
        tx.set(operation_ref, {"credits": cost, "cycle": current_cycle, "createdAt": firestore.SERVER_TIMESTAMP})
        tx.set(billing_ref, {"creditsUsed": credits_used + cost, "creditCycle": current_cycle,
                             "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return {"charged": cost, "remaining": None if limit is None else limit - credits_used - cost}

    return debit(transaction)
