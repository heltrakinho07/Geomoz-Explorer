import logging
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory session cache for fast access
_user_sessions = {}

def _get_db():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception:
        return None

def set_token(uid: str, token_data: dict) -> None:
    """Store GEE token data for a user in memory and optionally persist in Firestore."""
    if uid in _user_sessions:
        _user_sessions[uid].update(token_data)
    else:
        _user_sessions[uid] = dict(token_data)
    logger.info("GEE credentials stored in memory for user: %s", uid)
    db = _get_db()
    if db:
        try:
            db.collection("users").document(uid).collection("settings").document("gee").set(token_data, merge=True)
            logger.info("GEE credentials persisted to Firestore for user: %s", uid)
        except Exception as e:
            logger.warning("Failed to persist GEE credentials to Firestore: %s", e)

def get_token(uid: str) -> Optional[dict]:
    """Retrieve GEE token data for a user from memory or Firestore."""
    if uid in _user_sessions:
        return _user_sessions[uid]
    db = _get_db()
    if db:
        try:
            doc = db.collection("users").document(uid).collection("settings").document("gee").get()
            if doc.exists:
                data = doc.to_dict()
                _user_sessions[uid] = data
                return data
        except Exception as e:
            logger.warning("Failed to load GEE token from Firestore: %s", e)
    return None

def clear_token(uid: str) -> None:
    """Clear GEE token data for a user."""
    if uid in _user_sessions:
        del _user_sessions[uid]
    db = _get_db()
    if db:
        try:
            db.collection("users").document(uid).collection("settings").document("gee").delete()
        except Exception as e:
            logger.warning("Failed to delete GEE token from Firestore: %s", e)
    logger.info("GEE token cleared for user: %s", uid)
