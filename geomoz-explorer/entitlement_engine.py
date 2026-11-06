"""Atomic pre-execution GeoMoz credit reservations.

This extends the existing billing/{uid} UTC-month counter used by /billing/usage
and debit_usage_credits. No duplicate ledger or client-controlled amounts.
AI metering is opt-in until production validation is complete.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from billing import _credit_usage, _db, _effective_plan, _utcnow, firestore
from platform_config import get_plan_limits

OPERATION_COSTS = {"ai.agent_chat": 1}
LEASE_SECONDS = 3600


def metering_enabled():
    return os.environ.get("GEOMOZ_ENFORCE_AI_CREDITS", "false").strip().lower() == "true"


def operation_cost(key):
    if key not in OPERATION_COSTS:
        raise HTTPException(422, "Operação de consumo não reconhecida.")
    return OPERATION_COSTS[key]


def current_balances(state, limit, now):
    summary = _credit_usage(state, limit, now)
    cycle = summary["creditCycle"]
    reserved = (max(0, int(state.get("creditsReserved", 0) or 0))
                if state.get("reservationCycle") == cycle else 0)
    return cycle, summary["creditsUsed"], reserved


def _reservation_ref(database, uid, operation_id):
    return database.collection("billing").document(uid).collection("creditReservations").document(operation_id)


def expire_stale_reservations(uid, max_results=30):
    """Reclaim leases after a worker crash without changing completed charges.

    Called before each reservation. Each candidate is rechecked in a Firestore
    transaction; concurrent settlements cannot be reclaimed twice.
    """
    db = _db()
    billing_ref = db.collection("billing").document(uid)
    candidates = billing_ref.collection("creditReservations").where(
        "status", "==", "reserved"
    ).limit(max_results).stream()
    now = _utcnow()
    released = 0

    for candidate in candidates:
        ref = candidate.reference
        row = candidate.to_dict() or {}
        expires = row.get("expiresAt")
        if not isinstance(expires, str):
            continue
        try:
            lease_end = datetime.fromisoformat(expires.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            continue
        if lease_end > now:
            continue
        txn = db.transaction()

        @firestore.transactional
        def reclaim(tx):
            reservation_snap = ref.get(transaction=tx)
            billing_snap = billing_ref.get(transaction=tx)
            if not reservation_snap.exists:
                return False
            current = reservation_snap.to_dict() or {}
            if current.get("status") != "reserved" or current.get("expiresAt") != expires:
                return False
            bill = billing_snap.to_dict() if billing_snap.exists else {}
            patch = {}
            if bill.get("reservationCycle") == current.get("cycle"):
                patch["creditsReserved"] = max(
                    0, int(bill.get("creditsReserved", 0) or 0) - int(current["cost"])
                )
            tx.set(ref, {"status": "expired", "settledAt": now.isoformat()}, merge=True)
            if patch:
                tx.set(billing_ref, patch, merge=True)
            return True

        if reclaim(txn):
            released += 1
    return released


def reserve_credits(uid, operation):
    """Allocate the next credit before the scientific operation starts."""
    cost = operation_cost(operation)
    expire_stale_reservations(uid)
    db = _db()
    bill_ref = db.collection("billing").document(uid)
    operation_id = secrets.token_hex(16)
    reservation_ref = _reservation_ref(db, uid, operation_id)
    now = _utcnow()
    expires = (now + timedelta(seconds=LEASE_SECONDS)).isoformat()
    tx = db.transaction()

    @firestore.transactional
    def allocate(transaction):
        bill_snap = bill_ref.get(transaction=transaction)
        bill = bill_snap.to_dict() if bill_snap.exists else {}
        plan = _effective_plan(bill)
        limit = get_plan_limits(plan)["credits"]
        cycle, used, reserved = current_balances(bill, limit, now)
        if limit is not None and used + reserved + cost > limit:
            raise HTTPException(402, "Créditos GeoMoz insuficientes. Consulte /planos.")
        transaction.create(reservation_ref, {
            "uid": uid, "operation": operation, "cost": cost,
            "cycle": cycle, "status": "reserved",
            "expiresAt": expires, "createdAt": now.isoformat(),
        })
        transaction.set(bill_ref, {
            "creditCycle": cycle, "creditsUsed": used,
            "reservationCycle": cycle, "creditsReserved": reserved + cost,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        return {"uid": uid, "id": operation_id, "cycle": cycle, "cost": cost}

    return allocate(tx)


def settle_credits(reservation, *, success):
    """Exactly-once settlement; repeated requests cannot debit twice."""
    if reservation is None:
        return None
    db = _db()
    bill_ref = db.collection("billing").document(reservation["uid"])
    reserve_ref = _reservation_ref(db, reservation["uid"], reservation["id"])
    event_ref = bill_ref.collection("usageEvents").document(reservation["id"])
    now = _utcnow()
    tx = db.transaction()

    @firestore.transactional
    def settle(transaction):
        hold_snap = reserve_ref.get(transaction=transaction)
        bill_snap = bill_ref.get(transaction=transaction)
        event_snap = event_ref.get(transaction=transaction)
        if not hold_snap.exists:
            raise HTTPException(409, "Reserva de créditos desconhecida.")
        hold = hold_snap.to_dict() or {}
        if hold.get("status") != "reserved":
            return hold.get("status")
        if (hold.get("uid"), hold.get("cycle"), hold.get("cost")) != (
            reservation["uid"], reservation["cycle"], reservation["cost"]
        ):
            raise HTTPException(409, "Reserva de créditos inconsistente.")
        bill = bill_snap.to_dict() if bill_snap.exists else {}
        patch = {}
        if bill.get("reservationCycle") == hold.get("cycle"):
            patch["creditsReserved"] = max(
                0, int(bill.get("creditsReserved", 0) or 0) - hold["cost"]
            )
        # A long-running request crossing UTC month boundary is recorded in
        # the previous cycle's event log, not charged to the new month's quota.
        if success and bill.get("creditCycle") == hold.get("cycle"):
            patch["creditsUsed"] = max(0, int(bill.get("creditsUsed", 0) or 0)) + hold["cost"]
        if success and not event_snap.exists:
            transaction.create(event_ref, {
                "credits": hold["cost"], "cycle": hold["cycle"],
                "operation": hold["operation"], "createdAt": firestore.SERVER_TIMESTAMP,
            })
        if patch:
            patch["updatedAt"] = firestore.SERVER_TIMESTAMP
            transaction.set(bill_ref, patch, merge=True)
        transaction.set(reserve_ref, {
            "status": "committed" if success else "released",
            "settledAt": now.isoformat(),
        }, merge=True)
        return "committed" if success else "released"

    return settle(tx)
