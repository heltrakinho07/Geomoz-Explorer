"""GeoMoz subscriptions: authoritative credit allowance and atomic reservations.

No client can choose a price, plan, balance, cost or UID. A billable operation
must be registered by a trusted API route; server-generated opaque IDs prevent
double charging. Credits are recorded per UTC calendar month, not just in a
mutable client-visible billing document.

The GEE user's own Google quotas are separate and are never represented as
GeoMoz credits.
"""
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from billing import _db, _effective_plan, _uid, _utcnow, firestore
from platform_config import get_plan_limits

router = APIRouter(prefix="/geomoz-api/billing", tags=["billing"])

# This first release has an explicit price for the built-in AI planning route.
# Other tools must be metered by their own trusted server handlers before being
# advertised as credit-enforced. Never derive costs from the browser.
OPERATION_COSTS = {"ai.agent_chat": 1}


def utc_cycle(now=None):
    dt = now or _utcnow()
    return dt.astimezone(timezone.utc).strftime("%Y-%m")


def plan_allowance(plan):
    limit = get_plan_limits(plan)["credits"]
    if limit is None:
        return None
    if type(limit) is not int or limit < 0:
        raise HTTPException(503, "Quota de créditos inválida.")
    return limit


def require_known_operation(operation):
    if operation not in OPERATION_COSTS:
        raise HTTPException(422, "Operação de consumo desconhecida.")
    return OPERATION_COSTS[operation]


def _refs(database, uid, cycle, reservation_id):
    usage = database.collection("billingUsage").document(uid).collection("cycles").document(cycle)
    reservation = usage.collection("reservations").document(reservation_id)
    billing = database.collection("billing").document(uid)
    return usage, reservation, billing


def _usage_summary(uid, now=None):
    cycle = utc_cycle(now)
    database = _db()
    snap = database.collection("billingUsage").document(uid).collection("cycles").document(cycle).get()
    billing_snap = database.collection("billing").document(uid).get()
    bill = billing_snap.to_dict() if billing_snap.exists else {}
    plan = _effective_plan(bill)
    limit = plan_allowance(plan)
    usage = snap.to_dict() if snap.exists else {}
    used = max(0, int(usage.get("used", 0)))
    reserved = max(0, int(usage.get("reserved", 0)))
    return {
        "plan": plan, "periodEnd": bill.get("periodEnd"),
        "cycle": cycle, "creditsLimit": limit, "creditsUsed": used,
        "creditsReserved": reserved,
        "creditsRemaining": None if limit is None else max(0, limit - used - reserved),
        "operationsMetered": list(OPERATION_COSTS),
    }


@router.get("/usage")
def my_usage(uid: str = Depends(_uid)):
    return _usage_summary(uid)


def reserve_credits(uid, operation):
    """Reserve before execution so concurrent calls cannot overspend.

    The identity must already be obtained from verified Firebase authentication.
    Returning None is permitted only in explicitly disabled metering mode.
    """
    cost = require_known_operation(operation)
    database = _db()
    now = _utcnow()
    cycle = utc_cycle(now)
    reservation_id = secrets.token_hex(16)
    usage_ref, reservation_ref, billing_ref = _refs(database, uid, cycle, reservation_id)
    transaction = database.transaction()

    @firestore.transactional
    def allocate(tx):
        bill_snap = billing_ref.get(transaction=tx)
        usage_snap = usage_ref.get(transaction=tx)
        bill = bill_snap.to_dict() if bill_snap.exists else {}
        usage = usage_snap.to_dict() if usage_snap.exists else {}
        plan = _effective_plan(bill)
        allowed = plan_allowance(plan)
        used = max(0, int(usage.get("used", 0)))
        outstanding = max(0, int(usage.get("reserved", 0)))
        if allowed is not None and used + outstanding + cost > allowed:
            raise HTTPException(
                402, "Créditos GeoMoz insuficientes para esta análise. Consulte /planos."
            )
        tx.set(usage_ref, {
            "cycle": cycle, "used": used, "reserved": outstanding + cost,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        tx.create(reservation_ref, {
            "uid": uid, "operation": operation, "cost": cost,
            "cycle": cycle, "status": "reserved",
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return {"uid": uid, "cycle": cycle, "id": reservation_id, "cost": cost}

    return allocate(transaction)


def settle_credits(reservation, *, success):
    """Idempotently commit or release the reservation across repeat requests.

    A payment/plan change after reservation does not alter the agreed cost.
    """
    if not reservation:
        return
    database = _db()
    usage_ref, reservation_ref, _ = _refs(
        database, reservation["uid"], reservation["cycle"], reservation["id"]
    )
    transaction = database.transaction()

    @firestore.transactional
    def settle(tx):
        event = reservation_ref.get(transaction=tx)
        usage = usage_ref.get(transaction=tx)
        if not event.exists:
            raise HTTPException(409, "Reserva de créditos inexistente.")
        state = event.to_dict() or {}
        if state.get("status") != "reserved":
            return state.get("status")
        if not usage.exists:
            raise HTTPException(409, "Registo de créditos inexistente.")
        row = usage.to_dict() or {}
        cost = int(state["cost"])
        reserved = int(row.get("reserved", 0))
        if reserved < cost:
            raise HTTPException(409, "Saldo reservado inconsistente.")
        tx.set(usage_ref, {
            "reserved": reserved - cost,
            "used": int(row.get("used", 0)) + (cost if success else 0),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        tx.set(reservation_ref, {
            "status": "committed" if success else "released",
            "settledAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return "committed" if success else "released"

    return settle(transaction)


def metering_enabled():
    """Gradual rollout: no pre-existing AI workflows break until enabled."""
    return os.environ.get("GEOMOZ_ENFORCE_AI_CREDITS", "false").strip().lower() == "true"
