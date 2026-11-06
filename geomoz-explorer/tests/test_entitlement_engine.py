"""Entitlement engine safety checks. The Firestore emulator covers concurrency."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

import entitlement_engine as engine


def test_metering_is_opt_in_only(monkeypatch):
    monkeypatch.delenv("GEOMOZ_ENFORCE_AI_CREDITS", raising=False)
    assert engine.metering_enabled() is False
    monkeypatch.setenv("GEOMOZ_ENFORCE_AI_CREDITS", "false")
    assert engine.metering_enabled() is False
    monkeypatch.setenv("GEOMOZ_ENFORCE_AI_CREDITS", "true")
    assert engine.metering_enabled() is True


def test_cost_cannot_be_controlled_by_browser():
    assert engine.operation_cost("ai.agent_chat") == 1
    for candidate in ("ai.agent_chat:100", "gee", "community", ""):
        with pytest.raises(HTTPException) as exc:
            engine.operation_cost(candidate)
        assert exc.value.status_code == 422


def test_credit_reservations_count_for_quota(monkeypatch):
    now = datetime(2026, 11, 6, tzinfo=timezone.utc)
    state = {"creditCycle": "2026-11", "creditsUsed": 3,
             "reservationCycle": "2026-11", "creditsReserved": 2}
    cycle, used, reserved = engine.current_balances(state, 20, now)
    assert (cycle, used, reserved) == ("2026-11", 3, 2)


def test_credit_reserved_counter_resets_on_utc_cycle():
    next_month = datetime(2026, 12, 1, tzinfo=timezone.utc)
    state = {"creditCycle": "2026-11", "creditsUsed": 15,
             "reservationCycle": "2026-11", "creditsReserved": 5}
    cycle, used, reserved = engine.current_balances(state, 20, next_month)
    assert (cycle, used, reserved) == ("2026-12", 0, 0)


def test_lease_longer_than_normal_ai_request():
    assert engine.LEASE_SECONDS >= int(timedelta(minutes=30).total_seconds())
