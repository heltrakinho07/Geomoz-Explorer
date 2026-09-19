import os
import json
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_sessions_file = os.path.join(os.path.dirname(__file__), ".gee_sessions.json")
_lock = threading.Lock()

def _load_disk_cache() -> dict:
    if os.path.exists(_sessions_file):
        try:
            with open(_sessions_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_disk_cache(data: dict) -> None:
    try:
        with open(_sessions_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning("Failed to save local session cache: %s", e)

# In-memory session cache initialized from persistent disk cache
_user_sessions = _load_disk_cache()

def _get_db():
    try:
        from firebase_admin import firestore
        return firestore.client()
    except Exception:
        return None

def set_token(uid: str, token_data: dict) -> None:
    """Store GEE token data for a user in memory and local file, and sync to Firestore asynchronously."""
    with _lock:
        if uid in _user_sessions:
            _user_sessions[uid].update(token_data)
        else:
            _user_sessions[uid] = dict(token_data)
        _save_disk_cache(_user_sessions)
    logger.info("GEE credentials stored for user: %s", uid)

    # Asynchronously sync to Firestore in a daemon thread so it never blocks the HTTP request
    def _bg_sync():
        db = _get_db()
        if db:
            try:
                db.collection("users").document(uid).collection("settings").document("gee").set(token_data, merge=True)
                logger.info("GEE credentials synced to Firestore for user: %s", uid)
            except Exception as e:
                logger.debug("Background Firestore sync skipped/failed: %s", e)

    threading.Thread(target=_bg_sync, daemon=True).start()

def get_token(uid: str) -> Optional[dict]:
    """Retrieve GEE token data for a user instantly from memory or local cache."""
    with _lock:
        if uid in _user_sessions:
            return _user_sessions[uid]
    return None

def clear_token(uid: str) -> None:
    """Clear GEE token data for a user."""
    with _lock:
        if uid in _user_sessions:
            del _user_sessions[uid]
            _save_disk_cache(_user_sessions)

    def _bg_clear():
        db = _get_db()
        if db:
            try:
                db.collection("users").document(uid).collection("settings").document("gee").delete()
            except Exception:
                pass

    threading.Thread(target=_bg_clear, daemon=True).start()
    logger.info("GEE token cleared for user: %s", uid)
