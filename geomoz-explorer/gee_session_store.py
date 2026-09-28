"""Per-user Google Earth Engine credential store for GeoMoz.

Sensitive GEE credentials are server-side only.  Client-readable Firestore user
settings receive metadata (project/account/connection flags), never OAuth
access/refresh tokens or service-account private keys.

Cloud Run's filesystem is ephemeral, so plaintext disk persistence is disabled
by default.  A local disk cache can be explicitly enabled for development with
GEE_ENABLE_LOCAL_SESSION_CACHE=true.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

_sessions_file = os.path.join(os.path.dirname(__file__), ".gee_sessions.json")
_lock = threading.RLock()
_enable_local_cache = (
    os.environ.get("GEE_ENABLE_LOCAL_SESSION_CACHE", "false").strip().lower()
    == "true"
)

_SECRET_FIELDS = {
    "access_token",
    "refresh_token",
    "service_account_key",
    "client_secret",
}
_PUBLIC_FIELDS = {
    "project",
    "account",
    "connected",
    "is_permanent",
    "has_refresh_token",
    "updated_at",
}


def _load_disk_cache() -> dict:
    if not _enable_local_cache or not os.path.exists(_sessions_file):
        return {}
    try:
        with open(_sessions_file, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning("Failed to load local GEE session cache: %s", exc)
        return {}


def _save_disk_cache(data: dict) -> None:
    if not _enable_local_cache:
        return
    try:
        with open(_sessions_file, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
    except Exception as exc:
        logger.warning("Failed to save local GEE session cache: %s", exc)


_user_sessions: dict[str, dict] = _load_disk_cache()


def _get_db():
    try:
        from firebase_admin import firestore

        return firestore.client()
    except Exception as exc:
        logger.debug("Firestore credential store unavailable: %s", exc)
        return None


def _private_doc(db, uid: str):
    return (
        db.collection("server_integrations")
        .document(uid)
        .collection("credentials")
        .document("gee")
    )


def _public_doc(db, uid: str):
    return (
        db.collection("users")
        .document(uid)
        .collection("settings")
        .document("gee")
    )


def _public_metadata(token_data: dict) -> dict:
    project = token_data.get("project")
    account = token_data.get("account")
    has_refresh = bool(token_data.get("refresh_token"))
    has_sa = bool(token_data.get("service_account_key"))
    has_access = bool(token_data.get("access_token"))

    metadata = {
        "project": project,
        "account": account,
        "connected": bool(token_data.get("connected", has_refresh or has_sa or has_access)),
        "is_permanent": bool(token_data.get("is_permanent", has_refresh or has_sa)),
        "has_refresh_token": has_refresh,
        "updated_at": token_data.get("updated_at") or time.time(),
    }
    return {key: value for key, value in metadata.items() if value is not None}


def _contains_secret(data: dict) -> bool:
    return any(bool(data.get(field)) for field in _SECRET_FIELDS)


def _cache(uid: str, data: dict) -> dict:
    with _lock:
        _user_sessions[uid] = dict(data)
        _save_disk_cache(_user_sessions)
        return dict(_user_sessions[uid])


def set_token(uid: str, token_data: dict) -> None:
    """Persist one user's GEE credentials in a server-only store.

    The in-memory record is merged so OAuth refreshes can update only the token
    fields they received.  Firestore persistence is synchronous because losing a
    refresh token after an HTTP response would make Cloud Run reconnects flaky.
    """
    if not uid:
        raise ValueError("uid is required")
    if not isinstance(token_data, dict):
        raise TypeError("token_data must be a dict")

    with _lock:
        merged = dict(_user_sessions.get(uid, {}))
        merged.update(token_data)
        merged["updated_at"] = token_data.get("updated_at") or time.time()
        _user_sessions[uid] = merged
        _save_disk_cache(_user_sessions)

    db = _get_db()
    if db is None:
        logger.warning(
            "GEE credentials for user %s are only in memory; Firestore is unavailable.",
            uid,
        )
        return

    try:
        _private_doc(db, uid).set(merged, merge=True)
        _public_doc(db, uid).set(_public_metadata(merged), merge=False)
        logger.info("GEE credentials persisted server-side for user: %s", uid)
    except Exception as exc:
        logger.warning("Failed to persist GEE credentials for user %s: %s", uid, exc)


def _load_from_firestore(uid: str) -> Optional[dict]:
    db = _get_db()
    if db is None:
        return None

    # Preferred server-only credential document.
    try:
        snap = _private_doc(db, uid).get()
        if getattr(snap, "exists", False):
            data = snap.to_dict() or {}
            if data:
                return _cache(uid, data)
    except Exception as exc:
        logger.debug("Private GEE credential lookup failed for %s: %s", uid, exc)

    # One-time migration path from the legacy client-readable user settings doc.
    try:
        legacy_snap = _public_doc(db, uid).get()
        if not getattr(legacy_snap, "exists", False):
            return None

        legacy = legacy_snap.to_dict() or {}
        if not legacy:
            return None

        if _contains_secret(legacy):
            logger.info("Migrating legacy GEE credentials to server-only storage for %s", uid)
            set_token(uid, legacy)
            return _cache(uid, legacy)

        # Metadata-only legacy documents can still restore project/account.
        return _cache(uid, {key: legacy.get(key) for key in _PUBLIC_FIELDS if key in legacy})
    except Exception as exc:
        logger.debug("Legacy GEE settings lookup failed for %s: %s", uid, exc)
        return None


def get_token(uid: str) -> Optional[dict]:
    """Retrieve a user's GEE server-side credentials.

    On a Cloud Run cold start, lazily reload from Firestore instead of relying
    on an ephemeral local file.
    """
    if not uid:
        return None

    with _lock:
        cached = _user_sessions.get(uid)
        if cached is not None:
            return dict(cached)

    return _load_from_firestore(uid)


def clear_token(uid: str) -> None:
    """Delete both private GEE credentials and client-visible metadata."""
    if not uid:
        return

    with _lock:
        _user_sessions.pop(uid, None)
        _save_disk_cache(_user_sessions)

    db = _get_db()
    if db is not None:
        try:
            _private_doc(db, uid).delete()
        except Exception as exc:
            logger.debug("Private GEE credential delete failed for %s: %s", uid, exc)
        try:
            _public_doc(db, uid).delete()
        except Exception as exc:
            logger.debug("Public GEE metadata delete failed for %s: %s", uid, exc)

    logger.info("GEE credentials cleared for user: %s", uid)
