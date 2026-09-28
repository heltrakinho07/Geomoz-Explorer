"""Persistent, auditable multi-step plans for GeoMoz Agent.

A plan never executes arbitrary code. Each step references one deterministic
tool from tool_registry.py. Execution is advanced step-by-step by the API using
the existing AnalysisJob engine, preserving the same validation, ownership and
GEE lifecycle as manual analyses.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import logging
import threading
import uuid
from typing import Any, Optional

from tool_registry import get_tool

logger = logging.getLogger(__name__)

_plans: dict[tuple[str, str], dict[str, Any]] = {}
_lock = threading.Lock()

PLAN_TERMINAL = {"completed", "failed", "cancelled"}
STEP_TERMINAL = {"completed", "failed", "cancelled"}
MAX_PLAN_STEPS = 6


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _firestore():
    try:
        import firebase_admin
        from firebase_admin import firestore

        if not firebase_admin._apps:
            return None
        return firestore.client()
    except Exception:
        return None


def _doc(uid: str, plan_id: str):
    db = _firestore()
    if db is None:
        return None
    return (
        db.collection("geomoz_users")
        .document(uid)
        .collection("analysis_plans")
        .document(plan_id)
    )


def _save(uid: str, plan: dict[str, Any]) -> None:
    key = (uid, plan["id"])
    with _lock:
        _plans[key] = deepcopy(plan)

    ref = _doc(uid, plan["id"])
    if ref is not None:
        try:
            ref.set(plan, merge=True)
        except Exception as exc:
            logger.warning("Could not persist analysis plan %s: %s", plan["id"], exc)


def _load(uid: str, plan_id: str) -> Optional[dict[str, Any]]:
    key = (uid, plan_id)
    with _lock:
        cached = _plans.get(key)
        if cached is not None:
            return deepcopy(cached)

    ref = _doc(uid, plan_id)
    if ref is not None:
        try:
            snapshot = ref.get()
            if snapshot.exists:
                plan = snapshot.to_dict()
                if isinstance(plan, dict):
                    with _lock:
                        _plans[key] = deepcopy(plan)
                    return deepcopy(plan)
        except Exception as exc:
            logger.warning("Could not load analysis plan %s: %s", plan_id, exc)
    return None


def _public(plan: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(plan)


def _validate_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not steps:
        raise ValueError("O plano deve conter pelo menos uma etapa.")
    if len(steps) > MAX_PLAN_STEPS:
        raise ValueError(f"O plano pode conter no máximo {MAX_PLAN_STEPS} etapas.")

    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(steps):
        if not isinstance(raw, dict):
            raise ValueError(f"Etapa {index + 1} inválida.")

        tool_id = raw.get("tool_id")
        tool = get_tool(str(tool_id)) if tool_id else None
        if not tool:
            raise ValueError(f"Ferramenta não autorizada na etapa {index + 1}: {tool_id}")
        if tool.get("confirmation_required"):
            raise ValueError(
                f"A ferramenta {tool_id} requer confirmação e não pode entrar "
                "automaticamente num plano."
            )

        arguments = raw.get("arguments") or {}
        if not isinstance(arguments, dict):
            raise ValueError(f"Parâmetros inválidos na etapa {index + 1}.")

        normalized.append({
            "id": f"step-{index + 1}",
            "order": index + 1,
            "tool_id": tool_id,
            "tool_name": tool.get("name", tool_id),
            "purpose": str(raw.get("purpose") or tool.get("description") or "")[:500],
            "arguments": deepcopy(arguments),
            "status": "pending",
            "job_id": None,
            "message": "Aguardando execução.",
            "started_at": None,
            "completed_at": None,
        })
    return normalized


def create_plan(
    uid: str,
    *,
    title: str,
    goal: str,
    steps: list[dict[str, Any]],
    project_id: Optional[str] = None,
    source_message: Optional[str] = None,
) -> dict[str, Any]:
    now = _now()
    normalized_steps = _validate_steps(steps)
    plan = {
        "id": str(uuid.uuid4()),
        "title": (title or "Plano GeoMoz")[:160],
        "goal": (goal or "")[:2000],
        "source_message": (source_message or "")[:4000],
        "project_id": project_id,
        "status": "ready",
        "current_step": 0,
        "steps": normalized_steps,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
        "error": None,
        "execution_mode": "stepwise_analysis_jobs",
    }
    _save(uid, plan)
    return _public(plan)


def get_plan(uid: str, plan_id: str) -> Optional[dict[str, Any]]:
    plan = _load(uid, plan_id)
    return _public(plan) if plan else None


def list_plans(
    uid: str,
    *,
    project_id: Optional[str] = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    db = _firestore()
    plans: list[dict[str, Any]] = []

    if db is not None:
        try:
            query = (
                db.collection("geomoz_users")
                .document(uid)
                .collection("analysis_plans")
                .order_by("created_at", direction="DESCENDING")
                .limit(max(1, min(limit, 100)))
            )
            for snapshot in query.stream():
                data = snapshot.to_dict()
                if isinstance(data, dict):
                    plans.append(data)
        except Exception as exc:
            logger.warning("Could not list Firestore analysis plans: %s", exc)

    if not plans:
        with _lock:
            plans = [
                deepcopy(plan)
                for (owner, _), plan in _plans.items()
                if owner == uid
            ]
        plans.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        plans = plans[: max(1, min(limit, 100))]

    if project_id:
        plans = [plan for plan in plans if plan.get("project_id") == project_id]

    return [_public(plan) for plan in plans]


def update_plan(uid: str, plan_id: str, **changes: Any) -> Optional[dict[str, Any]]:
    plan = _load(uid, plan_id)
    if not plan:
        return None
    plan.update(changes)
    plan["updated_at"] = _now()
    _save(uid, plan)
    return _public(plan)


def update_step(
    uid: str,
    plan_id: str,
    step_index: int,
    **changes: Any,
) -> Optional[dict[str, Any]]:
    plan = _load(uid, plan_id)
    if not plan:
        return None

    steps = plan.get("steps") or []
    if not 0 <= step_index < len(steps):
        return None

    steps[step_index].update(changes)
    plan["steps"] = steps
    plan["current_step"] = step_index
    plan["updated_at"] = _now()
    _save(uid, plan)
    return _public(plan)


def cancel_plan(uid: str, plan_id: str) -> Optional[dict[str, Any]]:
    plan = _load(uid, plan_id)
    if not plan:
        return None
    if plan.get("status") in PLAN_TERMINAL:
        return _public(plan)

    now = _now()
    plan["status"] = "cancelled"
    plan["completed_at"] = now
    plan["updated_at"] = now

    for step in plan.get("steps") or []:
        if step.get("status") == "pending":
            step["status"] = "cancelled"
            step["message"] = "Etapa cancelada com o plano."
            step["completed_at"] = now

    _save(uid, plan)
    return _public(plan)
