"""Persistent project outputs for GeoMoz.

Outputs are durable, user-owned artefacts created from completed AnalysisJobs
or Agent plans. They intentionally store compact evidence/metadata rather than
ephemeral GEE tile URLs or large GeoJSON blobs.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import logging
import threading
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

_outputs: dict[tuple[str, str], dict[str, Any]] = {}
_lock = threading.Lock()


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


def _collection(uid: str):
    db = _firestore()
    if db is None:
        return None
    return (
        db.collection("users")
        .document(uid)
        .collection("project_outputs")
    )


def _public(item: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(item)


def _save(uid: str, item: dict[str, Any]) -> None:
    key = (uid, item["id"])
    with _lock:
        _outputs[key] = deepcopy(item)

    collection = _collection(uid)
    if collection is not None:
        try:
            collection.document(item["id"]).set(item, merge=True)
        except Exception as exc:
            logger.warning("Could not persist project output %s: %s", item["id"], exc)


def _load(uid: str, output_id: str) -> Optional[dict[str, Any]]:
    key = (uid, output_id)
    with _lock:
        cached = _outputs.get(key)
        if cached is not None:
            return deepcopy(cached)

    collection = _collection(uid)
    if collection is not None:
        try:
            snapshot = collection.document(output_id).get()
            if snapshot.exists:
                item = snapshot.to_dict()
                if isinstance(item, dict) and item.get("owner_id") == uid:
                    with _lock:
                        _outputs[key] = deepcopy(item)
                    return deepcopy(item)
        except Exception as exc:
            logger.warning("Could not load project output %s: %s", output_id, exc)
    return None


def find_output_by_source(
    uid: str,
    *,
    project_id: str,
    source_type: str,
    source_id: str,
) -> Optional[dict[str, Any]]:
    for item in list_outputs(uid, project_id=project_id, limit=200):
        if (
            item.get("source_type") == source_type
            and item.get("source_id") == source_id
        ):
            return _public(item)
    return None


def create_output(
    uid: str,
    *,
    project_id: str,
    output_type: str,
    title: str,
    source_type: str,
    source_id: str,
    content: dict[str, Any],
    description: str = "",
) -> dict[str, Any]:
    existing = find_output_by_source(
        uid,
        project_id=project_id,
        source_type=source_type,
        source_id=source_id,
    )
    if existing:
        return existing

    now = _now()
    item = {
        "id": uuid.uuid4().hex,
        "owner_id": uid,
        "project_id": project_id,
        "type": output_type,
        "title": title.strip()[:180] or "GeoMoz Output",
        "description": description.strip()[:1000],
        "source_type": source_type,
        "source_id": source_id,
        "content": deepcopy(content),
        "created_at": now,
        "updated_at": now,
    }
    _save(uid, item)
    return _public(item)


def get_output(uid: str, output_id: str) -> Optional[dict[str, Any]]:
    item = _load(uid, output_id)
    return _public(item) if item else None


def list_outputs(
    uid: str,
    *,
    project_id: Optional[str] = None,
    output_type: Optional[str] = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 200))
    collection = _collection(uid)
    items: list[dict[str, Any]] = []

    if collection is not None:
        try:
            for snapshot in collection.stream():
                data = snapshot.to_dict()
                if isinstance(data, dict) and data.get("owner_id") == uid:
                    items.append(data)
        except Exception as exc:
            logger.warning("Could not list project outputs for uid=%s: %s", uid, exc)

    if not items:
        with _lock:
            items = [
                deepcopy(item)
                for (owner, _), item in _outputs.items()
                if owner == uid
            ]

    if project_id:
        items = [item for item in items if item.get("project_id") == project_id]
    if output_type:
        items = [item for item in items if item.get("type") == output_type]

    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return [_public(item) for item in items[:limit]]


def delete_output(uid: str, output_id: str) -> bool:
    item = _load(uid, output_id)
    if not item:
        return False

    with _lock:
        _outputs.pop((uid, output_id), None)

    collection = _collection(uid)
    if collection is not None:
        try:
            collection.document(output_id).delete()
        except Exception as exc:
            logger.warning("Could not delete project output %s: %s", output_id, exc)
            return False
    return True



def compact_evidence(value: Any, depth: int = 0) -> Any:
    """Return a durable compact representation suitable for Firestore reports."""
    if depth > 5:
        return "[conteúdo omitido]"

    if isinstance(value, dict):
        compact: dict[str, Any] = {}
        for key, item in value.items():
            lower = str(key).lower()
            if any(token in lower for token in (
                "tile", "access_token", "refresh_token",
                "token", "credentials", "coordinates", "geojson", "training",
            )):
                continue
            compact[str(key)] = compact_evidence(item, depth + 1)
        return compact

    if isinstance(value, list):
        return [compact_evidence(item, depth + 1) for item in value[:50]]

    if isinstance(value, str):
        return value[:4000]

    return value
