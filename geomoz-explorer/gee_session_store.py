import logging
import time
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# Hot cache for the current Cloud Run instance. Firestore is the durable source
# when available so a user session survives instance restarts and scale-out.
_user_sessions: dict[str, dict] = {}
_DEFAULT_TOKEN_TTL_SECONDS = max(
    300,
    min(int(__import__("os").environ.get("GEE_OAUTH_TOKEN_TTL_SECONDS", "3300")), 3600),
)


def _is_expired(payload: dict) -> bool:
    expires_at = payload.get("expires_at")
    if expires_at is None:
        # Legacy sessions did not record an expiry. Treat them as stale rather
        # than keeping an unknown-lived bearer token indefinitely.
        return True
    try:
        return float(expires_at) <= time.time()
    except (TypeError, ValueError):
        return True



@lru_cache(maxsize=1)
def _get_firestore_client():
    """Return a Firestore client when Firebase/Firestore is available.

    Local development and deployments without Firestore keep working through
    the in-memory fallback.
    """
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception as exc:
        logger.warning("Firestore unavailable for GEE session persistence: %s", exc)
        return None


def set_token(uid: str, token_data: dict) -> None:
    """Store GEE OAuth data for one authenticated GeoMoz user."""
    payload = dict(token_data)
    now = time.time()
    payload["updated_at"] = now
    payload["expires_at"] = float(
        payload.get("expires_at") or (now + _DEFAULT_TOKEN_TTL_SECONDS)
    )
    _user_sessions[uid] = payload

    db = _get_firestore_client()
    if db is not None:
        try:
            db.collection("gee_sessions").document(uid).set(payload)
        except Exception as exc:
            logger.warning("Could not persist GEE session for uid=%s: %s", uid, exc)

    logger.info("GEE session stored for uid=%s", uid)


def get_token(uid: str) -> Optional[dict]:
    """Retrieve a user's GEE OAuth data.

    Checks the local hot cache first, then Firestore. Sensitive token values
    must never be logged.
    """
    cached = _user_sessions.get(uid)
    if cached:
        if _is_expired(cached):
            clear_token(uid)
            return None
        return dict(cached)

    db = _get_firestore_client()
    if db is not None:
        try:
            snapshot = db.collection("gee_sessions").document(uid).get()
            if snapshot.exists:
                payload = snapshot.to_dict() or {}
                if payload.get("access_token"):
                    if _is_expired(payload):
                        clear_token(uid)
                        return None
                    _user_sessions[uid] = payload
                    return dict(payload)
        except Exception as exc:
            logger.warning("Could not load GEE session for uid=%s: %s", uid, exc)

    return None


def clear_token(uid: str) -> None:
    """Remove only the user's Earth Engine connection, not the GeoMoz login."""
    _user_sessions.pop(uid, None)

    db = _get_firestore_client()
    if db is not None:
        try:
            db.collection("gee_sessions").document(uid).delete()
        except Exception as exc:
            logger.warning("Could not delete GEE session for uid=%s: %s", uid, exc)

    logger.info("GEE session cleared for uid=%s", uid)
