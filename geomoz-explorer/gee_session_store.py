"""Server-only GEE credential storage scoped to the verified Firebase UID.

Credential documents are outside client-readable `users/{uid}` paths. The
Firebase Admin SDK is the only writer/reader. Do not persist service-account
keys or refresh tokens to browser-accessible Firestore documents or local disk.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)
_PRIVATE_COLLECTION = "geePrivateSessions"
_SENSITIVE_FIELDS = ("access_token", "refresh_token", "service_account_key")
_MEMORY_ONLY = os.getenv("GEOMOZ_GEE_MEMORY_STORE_FOR_TESTS", "false").lower() == "true"
_test_sessions: dict[str, dict] = {}


def _get_db():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception:
        return None


def _require_uid(uid: str) -> None:
    if not isinstance(uid, str) or not uid.strip() or "/" in uid or uid in ("default", "guest_user"):
        raise ValueError("GEE requer um Firebase UID autenticado.")


def _private_ref(db, uid: str):
    return db.collection(_PRIVATE_COLLECTION).document(uid)


def _migrate_legacy(db, uid: str) -> Optional[dict]:
    """One-time migration from an old user-readable settings document.

    Move credential fields to server-only storage and delete the former fields.
    A failed cleanup prevents returning credentials so the issue is visible.
    """
    from firebase_admin import firestore
    old_ref = db.collection("users").document(uid).collection("settings").document("gee")
    snapshot = old_ref.get()
    if not snapshot.exists:
        return None
    legacy = snapshot.to_dict() or {}
    migrated = {name: legacy[name] for name in
                (*_SENSITIVE_FIELDS, "project", "account", "expires_in", "updated_at")
                if name in legacy}
    if not any(migrated.get(name) for name in _SENSITIVE_FIELDS):
        return None
    _private_ref(db, uid).set(migrated, merge=True)
    old_ref.update({field: firestore.DELETE_FIELD for field in _SENSITIVE_FIELDS if field in legacy})
    logger.info("Legacy GEE credentials migrated to private storage for authenticated UID.")
    return migrated


def get_token(uid: str) -> Optional[dict]:
    _require_uid(uid)
    db = _get_db()
    if db is None:
        return dict(_test_sessions.get(uid, {})) or None if _MEMORY_ONLY else None
    snapshot = _private_ref(db, uid).get()
    if snapshot.exists:
        return snapshot.to_dict() or None
    return _migrate_legacy(db, uid)


def set_token(uid: str, token_data: dict) -> None:
    _require_uid(uid)
    if not isinstance(token_data, dict):
        raise ValueError("Os dados GEE devem ser um objeto.")
    db = _get_db()
    if db is None:
        if not _MEMORY_ONLY:
            raise RuntimeError("Firestore Admin indisponível: credenciais GEE não foram guardadas.")
        existing = _test_sessions.get(uid, {})
        _test_sessions[uid] = {**existing, **token_data}
        return
    _private_ref(db, uid).set(token_data, merge=True)


def clear_token(uid: str) -> None:
    _require_uid(uid)
    db = _get_db()
    if db is None:
        if not _MEMORY_ONLY:
            raise RuntimeError("Firestore Admin indisponível: não foi possível desligar GEE.")
        _test_sessions.pop(uid, None)
        return
    _private_ref(db, uid).delete()
    # Also scrub any historic browser-visible credentials for this UID.
    from firebase_admin import firestore
    old_ref = db.collection("users").document(uid).collection("settings").document("gee")
    old = old_ref.get()
    if old.exists:
        fields = old.to_dict() or {}
        remove = {name: firestore.DELETE_FIELD for name in _SENSITIVE_FIELDS if name in fields}
        if remove:
            old_ref.update(remove)
