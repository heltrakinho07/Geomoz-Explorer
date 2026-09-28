"""User-scoped persistent projects for GeoMoz.

Projects are the durable workspace boundary: AOI, map state and metadata live
here; analysis jobs can reference a project_id. Firestore is the durable store
when available, with an in-memory fallback for local development/tests.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional

logger = logging.getLogger(__name__)

_projects: dict[tuple[str, str], dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@lru_cache(maxsize=1)
def _firestore():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception as exc:
        logger.warning("Firestore unavailable for projects: %s", exc)
        return None


def _collection(uid: str):
    db = _firestore()
    if db is None:
        return None
    return db.collection("users").document(uid).collection("projects")


def _public(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project["id"],
        "name": project["name"],
        "description": project.get("description", ""),
        "solution_id": project.get("solution_id"),
        "aoi": project.get("aoi"),
        "map_state": project.get("map_state", {}),
        "created_at": project["created_at"],
        "updated_at": project["updated_at"],
    }


def _save(uid: str, project: dict[str, Any]) -> None:
    key = (uid, project["id"])
    with _lock:
        _projects[key] = dict(project)

    collection = _collection(uid)
    if collection is not None:
        try:
            collection.document(project["id"]).set(project)
        except Exception as exc:
            logger.warning("Could not persist project %s: %s", project["id"], exc)


def create_project(
    uid: str,
    name: str,
    description: str = "",
    aoi: Optional[dict[str, Any]] = None,
    map_state: Optional[dict[str, Any]] = None,
    solution_id: Optional[str] = None,
) -> dict[str, Any]:
    now = _now()
    project = {
        "id": uuid.uuid4().hex,
        "owner_id": uid,
        "name": name.strip(),
        "description": description.strip(),
        "solution_id": solution_id,
        "aoi": aoi,
        "map_state": map_state or {},
        "created_at": now,
        "updated_at": now,
    }
    _save(uid, project)
    return _public(project)


def get_project(uid: str, project_id: str) -> Optional[dict[str, Any]]:
    key = (uid, project_id)
    with _lock:
        cached = _projects.get(key)
        if cached:
            return _public(cached)

    collection = _collection(uid)
    if collection is not None:
        try:
            snapshot = collection.document(project_id).get()
            if snapshot.exists:
                project = snapshot.to_dict() or {}
                if project.get("id") and project.get("owner_id") == uid:
                    with _lock:
                        _projects[key] = dict(project)
                    return _public(project)
        except Exception as exc:
            logger.warning("Could not load project %s: %s", project_id, exc)

    return None


def list_projects(uid: str, limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 200))
    collection = _collection(uid)

    if collection is not None:
        try:
            snapshots = collection.stream()
            items = [s.to_dict() or {} for s in snapshots]
            items = [
                item for item in items
                if item.get("id") and item.get("owner_id") == uid
            ]
            items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
            return [_public(item) for item in items[:limit]]
        except Exception as exc:
            logger.warning("Could not list projects for uid=%s: %s", uid, exc)

    with _lock:
        items = [
            dict(project)
            for (owner, _), project in _projects.items()
            if owner == uid
        ]
    items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return [_public(item) for item in items[:limit]]


def update_project(
    uid: str,
    project_id: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    aoi: Optional[dict[str, Any]] = None,
    map_state: Optional[dict[str, Any]] = None,
    update_aoi: bool = False,
    update_map_state: bool = False,
) -> Optional[dict[str, Any]]:
    existing = get_project(uid, project_id)
    if not existing:
        return None

    project = {
        **existing,
        "owner_id": uid,
    }

    if name is not None:
        project["name"] = name.strip()
    if description is not None:
        project["description"] = description.strip()
    if update_aoi:
        project["aoi"] = aoi
    if update_map_state:
        project["map_state"] = map_state or {}

    project["updated_at"] = _now()
    _save(uid, project)
    return _public(project)


def delete_project(uid: str, project_id: str) -> bool:
    existing = get_project(uid, project_id)
    if not existing:
        return False

    with _lock:
        _projects.pop((uid, project_id), None)

    collection = _collection(uid)
    if collection is not None:
        try:
            collection.document(project_id).delete()
        except Exception as exc:
            logger.warning("Could not delete project %s: %s", project_id, exc)
            return False

    return True


def touch_project(uid: str, project_id: str) -> Optional[dict[str, Any]]:
    """Update project activity time without altering its saved workspace."""
    existing = get_project(uid, project_id)
    if not existing:
        return None

    project = {
        **existing,
        "owner_id": uid,
        "updated_at": _now(),
    }
    _save(uid, project)
    return _public(project)
