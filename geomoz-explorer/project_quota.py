"""Authenticated, server-enforced GeoMoz cloud project quotas.

Browser-local/offline guest projects remain available as local-only work.
Cloud projects for signed-in accounts are created/deleted only by this router.
"""
import hashlib
import json
import secrets
from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from billing import _db, _effective_plan, _uid, firestore
from platform_config import get_plan_limits

router = APIRouter(prefix="/geomoz-api/projects", tags=["projects"])
ProjectCategory = Literal[
    "agricultura",
    "recursos_hidricos",
    "ordenamento_territorial",
    "geoperigos",
    "conservacao_ambiental",
    "estudo_geral",
]


class Period(BaseModel):
    startDate: str
    endDate: str


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    category: ProjectCategory
    aoi: dict[str, Any]
    period: Period


def validate_project(input_data: CreateProjectRequest):
    """Reject pathological payloads and invalid scientific periods."""
    if not input_data.name.strip():
        raise HTTPException(422, "O projecto precisa de um nome.")
    try:
        start = date.fromisoformat(input_data.period.startDate)
        end = date.fromisoformat(input_data.period.endDate)
    except ValueError as exc:
        raise HTTPException(422, "Datas do projecto inválidas.") from exc
    if start > end:
        raise HTTPException(422, "A data inicial deve preceder a final.")
    if len(json.dumps(input_data.aoi, ensure_ascii=False).encode("utf-8")) > 300_000:
        raise HTTPException(413, "Área de estudo demasiado extensa para um projecto.")
    return start, end


def quota_check(count, limit):
    if limit is not None and count >= limit:
        raise HTTPException(402, "Limite de projectos do plano atingido. Consulte /planos.")


def _project_collection(database, uid):
    return database.collection("users").document(uid).collection("projects")


def _quota_ref(database, uid):
    return database.collection("billingProjectQuota").document(uid)


def _project_count(projects, transaction):
    # Read actual documents in the same transaction as the quota write.
    # The quota document serializes mutations; its stored count is advisory.
    return sum(1 for _ in projects.select([]).stream(transaction=transaction))


@router.post("")
def create_project(
    payload: CreateProjectRequest,
    uid: str = Depends(_uid),
    idempotency_key: str | None = Header(default=None, pattern=r"^[a-zA-Z0-9_-]{16,80}$"),
):
    validate_project(payload)
    database = _db()
    projects = _project_collection(database, uid)
    quota_ref = _quota_ref(database, uid)
    billing_ref = database.collection("billing").document(uid)
    request_ref = quota_ref.collection("createRequests").document(idempotency_key) if idempotency_key else None
    fingerprint = hashlib.sha256(json.dumps(payload.model_dump(), sort_keys=True).encode()).hexdigest()
    project_id = "proj_" + secrets.token_hex(12)
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "userId": uid,
        "name": payload.name.strip(),
        "description": payload.description.strip(),
        "category": payload.category,
        "aoi": payload.aoi,
        "period": payload.period.model_dump(),
        "statsSummary": {"totalRuns": 0},
        "createdAt": now,
        "updatedAt": now,
    }
    project_ref = projects.document(project_id)
    tx = database.transaction()

    @firestore.transactional
    def allocate(transaction):
        quota_ref.get(transaction=transaction)
        if request_ref is not None:
            request = request_ref.get(transaction=transaction)
            if request.exists:
                prior = request.to_dict()
                if prior["fingerprint"] != fingerprint:
                    raise HTTPException(409, "Identificador já utilizado para outro projecto.")
                existing = projects.document(prior["projectId"]).get(transaction=transaction)
                if not existing.exists:
                    raise HTTPException(410, "O projecto desta operação já foi eliminado.")
                return {"id": existing.id, **existing.to_dict(), "plan": prior["plan"]}
        billing_snap = billing_ref.get(transaction=transaction)
        count = _project_count(projects, transaction)
        entitlement = billing_snap.to_dict() if billing_snap.exists else {}
        plan = _effective_plan(entitlement)
        quota_check(count, get_plan_limits(plan)["projects"])
        transaction.create(project_ref, record)
        transaction.set(quota_ref, {
            "count": count + 1,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        if request_ref is not None:
            transaction.create(request_ref, {"projectId": project_id, "plan": plan, "fingerprint": fingerprint})
        return {"id": project_id, **record, "plan": plan}

    return allocate(tx)


@router.delete("/{project_id}")
def delete_project(project_id: str, uid: str = Depends(_uid)):
    if not project_id.startswith("proj_") or len(project_id) > 90 or "/" in project_id:
        raise HTTPException(400, "Identificador de projecto inválido.")
    database = _db()
    projects = _project_collection(database, uid)
    quota_ref = _quota_ref(database, uid)
    project_ref = projects.document(project_id)
    if not project_ref.get().exists:
        raise HTTPException(404, "Projecto não encontrado.")

    # Firestore does not cascade nested collections. Deleting just "runs"
    # would leave GIS Workspace layers, models and processing history behind.
    # Enumerate all existing subcollections so new modules are also covered.
    # Retries remain safe if a prior batch succeeded before a timeout.
    def delete_children(parent):
        for subcollection in parent.collections():
            while True:
                children = list(subcollection.limit(200).stream())
                if not children:
                    break
                batch = database.batch()
                for child in children:
                    delete_children(child.reference)
                    batch.delete(child.reference)
                batch.commit()

    delete_children(project_ref)

    tx = database.transaction()

    @firestore.transactional
    def remove(transaction):
        project_snap = project_ref.get(transaction=transaction)
        quota_ref.get(transaction=transaction)
        if not project_snap.exists:
            raise HTTPException(404, "Projecto já eliminado.")
        count = _project_count(projects, transaction)
        transaction.delete(project_ref)
        transaction.set(quota_ref, {
            "count": max(0, count - 1),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)

    remove(tx)
    return {"deleted": True, "id": project_id}
