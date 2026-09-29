import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Dictionary to store GEE tokens by user uid
# In a robust production environment, this should be replaced by Redis or Firestore
_user_sessions = {}

def set_token(uid: str, token_data: dict) -> None:
    """Store GEE token data for a user."""
    _user_sessions[uid] = token_data
    logger.info("GEE token stored for user: %s", uid)

def get_token(uid: str) -> Optional[dict]:
    """Retrieve GEE token data for a user."""
    return _user_sessions.get(uid)

def clear_token(uid: str) -> None:
    """Clear GEE token data for a user."""
    if uid in _user_sessions:
        del _user_sessions[uid]
        logger.info("GEE token cleared for user: %s", uid)

