"""GeoMoz Explorer PayZeno subscriptions.

The PayZeno checkout is a one-off payment for a month or year of access;
automatic recurring debits are NOT assumed or advertised.
Never trust a browser redirect for fulfillment.
"""
import base64
import calendar
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

try:
    from firebase_admin import firestore, auth as firebase_auth
except ImportError:  # Optional dependency for local test installs; required in production.
    firestore = None
    firebase_auth = None

from platform_config import get_plan_config, get_plan_limits, read_config

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])
GB = 1024 ** 3
PLAN_LIMITS = {
    "community": {"projects": 3, "storage_bytes": GB // 2, "credits": 20, "seats": 1, "concurrent_jobs": 1},
    "academic": {"projects": 15, "storage_bytes": 5 * GB, "credits": 150, "seats": 1, "concurrent_jobs": 1},
    "pro": {"projects": 75, "storage_bytes": 30 * GB, "credits": 800, "seats": 1, "concurrent_jobs": 2},
    "teams": {"projects": 200, "storage_bytes": 150 * GB, "credits": 3000, "seats": 5, "concurrent_jobs": 5},
    "enterprise": {"projects": None, "storage_bytes": None, "credits": None, "seats": None, "concurrent_jobs": None},
}
PRICES_MZN = {
    ("academic", "monthly"): 299, ("academic", "yearly"): 2990,
    ("pro", "monthly"): 1199, ("pro", "yearly"): 11990,
    ("teams", "monthly"): 4999, ("teams", "yearly"): 49990,
}
FREE = {"plan": "community", "status": "active", "creditsUsed": 0, "storageUsedBytes": 0}
INTERNATIONAL_CHECKOUT_CONTACT = "+258860406315"
REFERENCE_PATTERN = re.compile(r"^GMZ-([a-f0-9]{32})$")
E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")
MOZ_PATTERN = re.compile(r"^\+2588[4-7]\d{7}$")


def _db():
    try:
        return firestore.client()
    except Exception as exc:
        raise HTTPException(503, "Serviço de facturação indisponível.") from exc


def _uid(request: Request):
    # Share the application's existing Firebase Admin verification.
    from api import _extract_uid_from_header
    uid = _extract_uid_from_header(request.headers.get("Authorization", ""))
    if not uid:
        raise HTTPException(401, "Autenticação Firebase necessária.")
    return uid


def _utcnow():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def _parse_date(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _add_months(start, months):
    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return start.replace(year=year, month=month, day=day)


def _effective_plan(state, now=None):
    plan = state.get("plan", "community")
    if state.get("status", "active") not in ("active", "trialing") or plan not in PLAN_LIMITS:
        return "community"
    if plan != "community":
        end = _parse_date(state.get("periodEnd"))
        if end is None or end <= (now or _utcnow()):
            return "community"
    return plan


def _billing_ref(uid):
    return _db().collection("billing").document(uid)


def _payment_ref(payment_id):
    return _db().collection("billingPayments").document(payment_id)


def _get_payment(uid, payment_id):
    if not re.fullmatch(r"[0-9a-f]{32}", payment_id):
        raise HTTPException(400, "Identificador inválido.")
    snap = _payment_ref(payment_id).get()
    data = snap.to_dict() if snap.exists else None
    if not data or data.get("uid") != uid:
        raise HTTPException(404, "Pagamento não encontrado.")
    return data


def _key():
    key = os.environ.get("PAYZENO_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Gateway PayZeno ainda não configurado.")
    return key


async def _status(checkout_id):
    if not checkout_id:
        raise HTTPException(409, "Sessão PayZeno ainda não disponível.")
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get(
            "https://api.payzeno.io/v1/checkout/sessions/" + quote(str(checkout_id), safe="") + "/status",
            headers={"Api-Key": _key(), "Accept": "application/json"},
        )
    if not response.is_success:
        raise HTTPException(502, "Não foi possível verificar o pagamento no PayZeno.")
    result = response.json()
    return result.get("data") or result.get("session") or result


def _check_session_identity(session, payment):
    """The source is a server-side GET of the stored checkout ID, not user input."""
    if session.get("checkout_id") and str(session["checkout_id"]) != str(payment["checkoutId"]):
        raise HTTPException(409, "Identificador PayZeno divergente.")
    if session.get("reference") and str(session["reference"]) != payment["reference"]:
        raise HTTPException(409, "Referência PayZeno divergente.")
    if session.get("currency") and str(session["currency"]).upper() != payment["currency"]:
        raise HTTPException(409, "Moeda PayZeno divergente.")
    if session.get("amount") is not None and int(session["amount"]) != payment["amountMinor"]:
        raise HTTPException(409, "Montante PayZeno divergente.")


def _verified_status(session, payment):
    _check_session_identity(session, payment)
    status = str(session.get("payment_status") or session.get("status") or "").lower()
    if status in ("paid", "succeeded", "success", "completed"):
        return "paid"
    if status in ("failed", "declined", "rejected"):
        return "failed"
    if status in ("expired", "cancelled", "canceled"):
        return "cancelled" if status.startswith("cancel") else "expired"
    return "pending"


def _apply_payment(payment, status, event_id):
    """Transactionally record event and apply once, even across webhook and polling."""
    database = _db()
    pay_ref = database.collection("billingPayments").document(payment["id"])
    billing_ref = database.collection("billing").document(payment["uid"])
    event_ref = database.collection("billingEvents").document(event_id)
    txn = database.transaction()

    @firestore.transactional
    def run(tx):
        pay_snap = pay_ref.get(transaction=tx)
        billing_snap = billing_ref.get(transaction=tx)
        event_snap = event_ref.get(transaction=tx)
        if event_snap.exists:
            return (pay_snap.to_dict() or {}).get("status", "pending")
        if not pay_snap.exists:
            raise HTTPException(404, "Pagamento desconhecido.")
        stored = pay_snap.to_dict()
        current = stored.get("status", "pending")
        bill = billing_snap.to_dict() if billing_snap.exists else {}
        changes = {}
        bchanges = {}
        now = _utcnow()
        if status == "paid" and current in ("pending", "failed", "cancelled", "expired"):
            start = now
            # Renewal of same active plan extends the existing period rather than losing remaining days.
            if _effective_plan(bill) == stored["plan"]:
                previous_end = _parse_date(bill.get("periodEnd"))
                if previous_end and previous_end > start:
                    start = previous_end
            end = _add_months(start, 12 if stored["period"] == "yearly" else 1)
            changes = {"status": "paid", "paidAt": _iso(now), "accessThrough": _iso(end)}
            bchanges = {
                "plan": stored["plan"], "status": "active",
                "periodEnd": _iso(end), "lastPaymentId": stored["id"],
                "billingCycle": stored["period"], "paymentProvider": "payzeno",
                "cancelAtPeriodEnd": False,
            }
        elif status in ("refunded", "chargeback") and current in ("pending", "paid"):
            changes = {"status": status}
            if current == "paid" and bill.get("lastPaymentId") == stored["id"]:
                bchanges = {"status": "cancelled", "periodEnd": _iso(now)}
        elif status in ("failed", "cancelled", "expired") and current == "pending":
            changes = {"status": status}
        tx.set(event_ref, {
            "paymentId": stored["id"], "uid": stored["uid"], "status": status,
            "processedAt": firestore.SERVER_TIMESTAMP,
        })
        if changes:
            tx.set(pay_ref, {**changes, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        if bchanges:
            tx.set(billing_ref, {**bchanges, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return changes.get("status", current)

    return run(txn)


class CheckoutRequest(BaseModel):
    plan: str
    period: str
    phone: str = Field(default="", max_length=32)
    checkout_region: str = "mz"
    customer_name: str = Field(default="", max_length=120)


def _normalise_phone(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("258"):
        return "+" + digits
    if len(digits) == 10 and digits.startswith("0"):
        return "+258" + digits[1:]
    if len(digits) == 9:
        return "+258" + digits
    return (value or "").strip()


@router.get("/me")
def me(uid: str = Depends(_uid)):
    snap = _billing_ref(uid).get()
    state = snap.to_dict() if snap.exists else dict(FREE)
    plan = _effective_plan(state)
    return {
        "plan": plan, "status": state.get("status", "active"),
        "periodEnd": state.get("periodEnd"), "limits": get_plan_limits(plan),
        "creditsUsed": state.get("creditsUsed", 0),
        "storageUsedBytes": state.get("storageUsedBytes", 0),
        "cancelAtPeriodEnd": False,
        "academicApproved": state.get("academicApproved") is True,
        "provider": state.get("paymentProvider") or "payzeno",
        "automaticRenewal": False,
    }


def _checkout_enabled():
    return os.environ.get("GEOMOZ_BILLING_ENABLED", "false").strip().lower() == "true"


@router.get("/catalog")
def public_catalog():
    """Public catalogue is server-sourced; clients never choose the price."""
    return read_config()


@router.get("/config")
def config():
    """Public-safe commercial readiness. No secrets or merchant credentials."""
    return {"provider": "payzeno", "checkoutEnabled": _checkout_enabled(),
            "teamsCheckoutEnabled": os.environ.get("GEOMOZ_TEAMS_CHECKOUT_ENABLED", "false").strip().lower() == "true",
            "automaticRenewal": False}


@router.post("/checkout")
async def checkout(payload: CheckoutRequest, uid: str = Depends(_uid)):
    if not _checkout_enabled():
        raise HTTPException(503, "Os pagamentos GeoMoz ainda estão em validação.")
    pair = (payload.plan, payload.period)
    if pair not in PRICES_MZN:
        raise HTTPException(400, "Plano ou período de pagamento inválido.")
    # Collaboration seats are not yet fully enforced; avoid selling unavailable Teams access.
    if payload.plan == "teams" and os.environ.get("GEOMOZ_TEAMS_CHECKOUT_ENABLED", "false").strip().lower() != "true":
        raise HTTPException(503, "As subscrições Teams estão disponíveis por pedido de adesão.")
    if payload.checkout_region not in ("mz", "international"):
        raise HTTPException(400, "Região de checkout inválida.")
    try:
        firebase_user = firebase_auth.get_user(uid)
    except Exception as exc:
        raise HTTPException(401, "Conta não encontrada.") from exc
    name = str(firebase_user.display_name or payload.customer_name).strip()
    email = str(firebase_user.email or "").strip()
    if len(name) < 2 or not email:
        raise HTTPException(400, "Complete o nome e e-mail da conta antes de pagar.")
    phone = (INTERNATIONAL_CHECKOUT_CONTACT if payload.checkout_region == "international"
             else _normalise_phone(payload.phone))
    if not E164_PATTERN.fullmatch(phone) or (payload.checkout_region == "mz" and not MOZ_PATTERN.fullmatch(phone)):
        raise HTTPException(400, "Indique um contacto válido (+25884/85/86/87...) ou escolha pagamento internacional.")
    current_snap = _billing_ref(uid).get()
    current = current_snap.to_dict() if current_snap.exists else {}
    if payload.plan == "academic" and not current.get("academicApproved"):
        raise HTTPException(403, "É necessária a validação da elegibilidade académica.")
    plan_config = get_plan_config(payload.plan)
    if not plan_config["enabled"]:
        raise HTTPException(403, "Este plano não está disponível para novas subscrições.")
    unit_price = plan_config["monthlyMzn"] if payload.period == "monthly" else plan_config["yearlyMzn"]
    if not isinstance(unit_price, int) or unit_price <= 0:
        raise HTTPException(503, "O preço deste plano precisa de configuração.")
    _key()  # Fail before reserving a payment when not configured.
    base = os.environ.get("GEOMOZ_PUBLIC_URL", "https://geomoz.geolithica.com").rstrip("/")
    if not base.startswith("https://"):
        raise HTTPException(503, "URL público GeoMoz inválido.")
    now = _utcnow()
    total = unit_price * 100
    fingerprint = hashlib.sha256(
        f"{uid}|{payload.plan}|{payload.period}|{phone}|{name}|{email}|{total}".encode()
    ).hexdigest()

    # A user has one active checkout intent at a time; requests are transactionally deduplicated.
    database = _db()
    state_ref = database.collection("billingCheckoutState").document(uid)
    txn = database.transaction()

    @firestore.transactional
    def allocate(tx):
        snap = state_ref.get(transaction=tx)
        state = snap.to_dict() if snap.exists else {}
        candidate = state.get("paymentId")
        if candidate and state.get("fingerprint") == fingerprint and time.time() - float(state.get("createdEpoch", 0)) < 1200:
            existing_ref = database.collection("billingPayments").document(candidate)
            existing_snap = existing_ref.get(transaction=tx)
            if existing_snap.exists and existing_snap.to_dict().get("status") == "pending":
                return existing_snap.to_dict()
        payment_id = secrets.token_hex(16)
        reference = "GMZ-" + payment_id
        record = {
            "id": payment_id, "uid": uid, "plan": payload.plan, "period": payload.period,
            "amountMinor": total, "currency": "MZN", "reference": reference,
            "status": "pending", "checkoutId": None, "checkoutUrl": None, "expiresAt": None,
            "customer": {"name": name, "email": email, "phone": phone},
            "idempotencyKey": "geomoz-" + payment_id + "-checkout",
            "createdAt": _iso(now), "createdEpoch": time.time(),
        }
        tx.set(database.collection("billingPayments").document(payment_id), record)
        tx.set(state_ref, {"paymentId": payment_id, "fingerprint": fingerprint, "createdEpoch": time.time()})
        return record

    payment = allocate(txn)
    expiry = _parse_date(payment.get("expiresAt"))
    cached_url = payment.get("checkoutUrl")
    if cached_url and cached_url.startswith("https://checkout.payzeno.io/") and (expiry is None or expiry > now):
        return {"url": cached_url, "payment_id": payment["id"], "status": "pending", "reused": True}

    success_url = f"{base}/planos?payment=success&payment_id={payment['id']}"
    cancel_url = f"{base}/planos?payment=cancelled&payment_id={payment['id']}"
    body = {
        "amount": payment["amountMinor"], "currency": "MZN",
        "reference": payment["reference"],
        "description": f"GeoMoz Explorer {payload.plan} ({payload.period})",
        "customer": payment["customer"],
        "success_url": success_url, "cancel_url": cancel_url,
        # Omit payment_methods: show ALL enabled, compatible merchant methods.
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.payzeno.io/v1/checkout/sessions",
                headers={
                    "Api-Key": _key(), "Idempotency-Key": payment["idempotencyKey"],
                    "Content-Type": "application/json", "Accept": "application/json",
                }, json=body,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "PayZeno demorou a responder. Repetir não duplica a sessão.") from exc
    if not response.is_success:
        raise HTTPException(502, "O PayZeno não conseguiu criar o checkout.")
    result = response.json()
    url = result.get("checkout_url", "")
    if not result.get("success") or not url.startswith("https://checkout.payzeno.io/") or not result.get("checkout_id"):
        raise HTTPException(502, "Resposta de sessão PayZeno inválida.")
    _payment_ref(payment["id"]).set({
        "checkoutId": str(result["checkout_id"]), "checkoutUrl": url,
        "expiresAt": result.get("expires_at"), "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    return {"url": url, "payment_id": payment["id"], "checkout_id": result["checkout_id"], "status": "pending"}


async def _verify_and_apply(payment, event_id):
    if payment.get("status") in ("refunded", "chargeback"):
        return payment["status"]
    session = await _status(payment.get("checkoutId"))
    status = _verified_status(session, payment)
    if status == "pending":
        return "pending"
    return _apply_payment(payment, status, event_id)


@router.get("/payments/{payment_id}")
async def payment_status(payment_id: str, uid: str = Depends(_uid)):
    payment = _get_payment(uid, payment_id)
    if payment.get("status") == "pending" and payment.get("checkoutId"):
        status = await _verify_and_apply(payment, "status-" + payment_id + "-" + str(int(time.time() // 60)))
    else:
        status = payment.get("status", "pending")
    return {"payment_id": payment_id, "status": status, "plan": payment["plan"]}


@router.get("/history")
def payment_history(uid: str = Depends(_uid)):
    entries = (
        _db().collection("billingPayments").where("uid", "==", uid).limit(100).stream()
    )
    result = []
    for snap in entries:
        p = snap.to_dict()
        result.append({
            "id": p["id"], "plan": p["plan"], "period": p["period"],
            "amountMzn": p["amountMinor"] / 100, "status": p["status"],
            "createdAt": p.get("createdAt"), "paidAt": p.get("paidAt"),
        })
    result.sort(key=lambda p: p["createdAt"] or "", reverse=True)
    return {"payments": result}


def _verify_signature(raw, signature):
    secret = os.environ.get("PAYZENO_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Webhook PayZeno não configurado.")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).digest()
    normalized = signature.strip().removeprefix("sha256=")
    digest_matches = (hmac.compare_digest(normalized.lower(), expected.hex()) or
                      hmac.compare_digest(normalized, base64.b64encode(expected).decode()))
    if not digest_matches:
        raise HTTPException(401, "Assinatura PayZeno inválida.")


@router.post("/webhook")
async def webhook(request: Request):
    raw = await request.body()
    _verify_signature(raw, request.headers.get("X-Signature", ""))
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Payload inválido.")
    event = payload.get("event")
    if event not in ("payment.succeeded", "payment.failed", "payment.cancelled",
                     "payment.expired", "payment.refunded", "payment.chargeback"):
        return {"received": True, "ignored": True}
    ref = str(payload.get("reference", ""))
    match = REFERENCE_PATTERN.fullmatch(ref)
    if not match:
        raise HTTPException(400, "Referência de pagamento GeoMoz obrigatória.")
    payment_id = match.group(1)
    snap = _payment_ref(payment_id).get()
    if not snap.exists:
        raise HTTPException(404, "Pagamento GeoMoz não encontrado.")
    payment = snap.to_dict()
    if payment.get("reference") != ref:
        raise HTTPException(409, "Referência divergente.")
    if payload.get("checkout_id") and str(payload["checkout_id"]) != str(payment.get("checkoutId")):
        raise HTTPException(409, "Sessão divergente.")
    if payload.get("currency") and str(payload["currency"]).upper() != payment["currency"]:
        raise HTTPException(409, "Moeda divergente.")
    if payload.get("amount") is not None and int(payload["amount"]) != payment["amountMinor"]:
        raise HTTPException(409, "Valor divergente.")

    event_id = "payzeno-" + hashlib.sha256(raw).hexdigest()
    if event == "payment.succeeded":
        # A signed event triggers independent provider-side verification, never blind activation.
        status = await _verify_and_apply(payment, event_id)
        if status != "paid":
            raise HTTPException(503, "A confirmação do PayZeno ainda não está disponível.")
    else:
        status = event.split(".", 1)[1]
        _apply_payment(payment, status, event_id)
    return {"received": True}


def charge_managed_cloud_credits(uid: str, cost: int, operation_id: str):
    """Trusted workers only. Not a browser endpoint; BYO-GEE does not consume credits."""
    if not isinstance(cost, int) or cost <= 0 or cost > 100000:
        raise ValueError("Créditos inválidos.")
    if not operation_id or len(operation_id) > 160 or "/" in operation_id:
        raise ValueError("Identificador inválido.")
    database = _db()
    billing_ref = database.collection("billing").document(uid)
    event_ref = billing_ref.collection("usageEvents").document(operation_id)
    cycle = _utcnow().strftime("%Y-%m")
    tx = database.transaction()

    @firestore.transactional
    def debit(transaction):
        event = event_ref.get(transaction=transaction)
        bill_snap = billing_ref.get(transaction=transaction)
        if event.exists:
            return {"alreadyCharged": True}
        state = bill_snap.to_dict() if bill_snap.exists else {}
        plan = _effective_plan(state)
        used = int(state.get("creditsUsed", 0) or 0) if state.get("creditCycle") == cycle else 0
        limit = get_plan_limits(plan)["credits"]
        if limit is not None and used + cost > limit:
            raise HTTPException(402, "Créditos insuficientes.")
        transaction.set(event_ref, {"credits": cost, "cycle": cycle, "createdAt": firestore.SERVER_TIMESTAMP})
        transaction.set(billing_ref, {"creditsUsed": used + cost, "creditCycle": cycle,
                                      "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return {"charged": cost, "remaining": None if limit is None else limit - used - cost}

    return debit(tx)


# ── Managed raster job credit reservations (not user-owned GEE work) ───────────

MANAGED_RASTER_COST = 1
_RESERVATION_TTL_SECONDS = 7200  # Longer than the configured 30-minute GDAL timeout.


def reserve_cloud_job_credit(uid: str, job_id: str):
    """Atomically reserve one GeoMoz credit BEFORE accepting a managed job.

    The job id is generated by the backend, never supplied by a browser.
    A reservation is refunded if admission fails, processing fails or the job
    is cancelled. Unexpected worker death is reconciled after the TTL.
    """
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Identificador de job inválido.")
    database = _db()
    ref = database.collection("billing").document(uid)
    event_ref = ref.collection("usageEvents").document("raster-" + job_id)
    cycle = _utcnow().strftime("%Y-%m")
    txn = database.transaction()

    @firestore.transactional
    def run(tx):
        event_snap = event_ref.get(transaction=tx)
        bill_snap = ref.get(transaction=tx)
        if event_snap.exists:
            return {"alreadyReserved": True}
        bill = bill_snap.to_dict() if bill_snap.exists else {}
        plan = _effective_plan(bill)
        # A refund or expiry between the API entitlement check and the atomic
        # reservation must never fall back to the free plan's credit allowance.
        if plan not in ("academic", "pro", "teams", "enterprise"):
            raise HTTPException(402, "Esta operação exige uma subscrição activa.")
        used = int(bill.get("creditsUsed", 0) or 0) if bill.get("creditCycle") == cycle else 0
        limit = get_plan_limits(plan)["credits"]
        if limit is not None and used + MANAGED_RASTER_COST > limit:
            raise HTTPException(402, "Créditos GeoMoz insuficientes para este processamento.")
        tx.set(event_ref, {
            "credits": MANAGED_RASTER_COST, "cycle": cycle, "status": "reserved",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "expiresEpoch": int(time.time()) + _RESERVATION_TTL_SECONDS,
            "tool": "managed-raster",
        })
        tx.set(ref, {
            "creditsUsed": used + MANAGED_RASTER_COST, "creditCycle": cycle,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return {"reserved": MANAGED_RASTER_COST,
                "remaining": None if limit is None else limit - used - MANAGED_RASTER_COST}

    return run(txn)


def settle_cloud_job_credit(uid: str, job_id: str, *, success: bool):
    """Idempotent completion/refund. First terminal outcome wins."""
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Identificador de job inválido.")
    database = _db()
    ref = database.collection("billing").document(uid)
    event_ref = ref.collection("usageEvents").document("raster-" + job_id)
    txn = database.transaction()

    @firestore.transactional
    def run(tx):
        event_snap = event_ref.get(transaction=tx)
        bill_snap = ref.get(transaction=tx)
        if not event_snap.exists:
            return {"alreadySettled": True}
        event = event_snap.to_dict() or {}
        if event.get("status") != "reserved":
            return {"alreadySettled": True}
        target = "completed" if success else "refunded"
        tx.set(event_ref, {"status": target, "settledAt": firestore.SERVER_TIMESTAMP}, merge=True)
        if not success:
            bill = bill_snap.to_dict() if bill_snap.exists else {}
            if bill.get("creditCycle") == event.get("cycle"):
                used = max(0, int(bill.get("creditsUsed", 0) or 0) - int(event.get("credits", 0)))
                tx.set(ref, {"creditsUsed": used,
                             "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return {"status": target}

    return run(txn)


def reconcile_stale_cloud_job_credits(uid: str, *, max_records: int = 20):
    """Lazy recovery after process termination/deployment.

    Called on the user's authenticated access snapshot, never by anonymous
    callers. Only long-expired reservations are refunded.
    """
    ref = _db().collection("billing").document(uid).collection("usageEvents")
    now = int(time.time())
    docs = ref.where("status", "==", "reserved").limit(max_records).stream()
    for snap in docs:
        event = snap.to_dict() or {}
        if snap.id.startswith("raster-") and int(event.get("expiresEpoch") or now + 1) < now:
            settle_cloud_job_credit(uid, snap.id[len("raster-"):], success=False)
