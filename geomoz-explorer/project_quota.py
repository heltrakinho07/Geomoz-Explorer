"""Authoritative cloud project creation/deletion with server-enforced plan quotas."""
from __future__ import annotations

import json
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from firebase_admin import firestore

from billing_auth import require_billing_auth
from billing_core import PLANS, current_plan, utcnow
from billing_api import _db

router = APIRouter(prefix="/geomoz-api/billing/projects", tags=["projects-quota"])


class ProjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2000)
    category: Literal["agricultura", "recursos_hidricos", "ordenamento_territorial",
                      "geoperigos", "conservacao_ambiental", "estudo_geral"]
    aoi: dict
    period: dict


@router.post("", status_code=201)
def create_cloud_project(body: ProjectInput, uid: str = Depends(require_billing_auth)):
    if len(json.dumps(body.aoi)) > 200_000:
        raise HTTPException(413, "A geometria da área de estudo excede 200 KB.")
    if len(json.dumps(body.period)) > 4_000:
        raise HTTPException(413, "Período inválido.")
    if not body.period.get("startDate") or not body.period.get("endDate"):
        raise HTTPException(422, "Indique as datas de início e fim.")
    db = _db()
    projects = db.collection("users").document(uid).collection("projects")
    account_ref = db.collection("billing_accounts").document(uid)
    project_id = "proj_" + uuid4().hex
    project_ref = projects.document(project_id)
    now = utcnow().isoformat()
    payload = {
        "userId": uid, "name": body.name.strip(), "description": body.description.strip(),
        "category": body.category, "aoi": body.aoi, "period": body.period,
        "statsSummary": {"totalRuns": 0}, "createdAt": now, "updatedAt": now,
    }
    txn = db.transaction()

    @firestore.transactional
    def save(tx):
        account_snapshot = account_ref.get(transaction=tx)
        plan = current_plan(account_snapshot.to_dict() if account_snapshot.exists else {})
        limit = PLANS[plan]["projects"]
        if limit is None:
            raise HTTPException(503, "Limite Enterprise requer configuração institucional.")
        existing = sum(1 for _ in projects.stream(transaction=tx))
        if existing >= limit:
            raise HTTPException(403, f"Limite de {limit} projectos cloud atingido no plano {PLANS[plan]['name']}.")
        tx.set(project_ref, payload)
        return existing + 1

    count = save(txn)
    return {"project": {"id": project_id, **payload}, "project_count": count}


@router.delete("/{project_id}")
def delete_cloud_project(project_id: str, uid: str = Depends(require_billing_auth)):
    if not project_id.startswith("proj_") or len(project_id) > 80 or "/" in project_id:
        raise HTTPException(400, "ID de projecto inválido.")
    db = _db()
    ref = db.collection("users").document(uid).collection("projects").document(project_id)
    if not ref.get().exists:
        raise HTTPException(404, "Projecto não encontrado.")
    # Subcollection documents are not automatically removed by Firestore delete.
    while True:
        docs = list(ref.collection("runs").limit(250).stream())
        if not docs:
            break
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
    ref.delete()
    return {"deleted": True, "project_id": project_id}
