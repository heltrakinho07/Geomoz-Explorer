"""Persistent per-user Google Earth Engine credential storage.

Cloud Run instances and their local files are ephemeral. Never acknowledge a
credential write before durable storage succeeds or silently use a disk cache.
"""
import logging
import os
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _get_db():
    """Return the explicitly configured project's Firestore client."""
    try:
        import firebase_admin
        from firebase_admin import firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app(
                options={"projectId": os.environ.get("FIREBASE_PROJECT_ID")
                         or os.environ.get("GOOGLE_CLOUD_PROJECT")
                         or "geoprocessamento-426809"}
            )
        return firestore.client()
    except Exception:
        logger.exception("GEE session store: Firestore initialization failed")
        raise HTTPException(
            status_code=503,
            detail="Armazenamento GEE indisponível. Verifique Firestore e permissões do Cloud Run.",
        ) from None


def _document(uid: str):
    if not isinstance(uid, str) or not uid.strip() or "/" in uid:
        raise HTTPException(status_code=401, detail="Utilizador autenticado inválido.")
    return _get_db().collection("users").document(uid).collection("settings").document("gee")


def _storage_error(operation: str, exc: Exception):
    logger.error("GEE session Firestore %s failed: %s", operation, type(exc).__name__, exc_info=True)
    raise HTTPException(
        status_code=503,
        detail="Não foi possível aceder ao armazenamento persistente das credenciais GEE. "
               "Confirme a base de dados Firestore (default) e as permissões da conta de serviço.",
    ) from exc


def set_token(uid: str, token_data: dict) -> None:
    """Commit credentials durably before reporting success to the API."""
    if not isinstance(token_data, dict):
        raise ValueError("token_data must be a dictionary")
    ref = _document(uid)
    try:
        ref.set(token_data, merge=True)
    except Exception as exc:
        _storage_error("write", exc)
    logger.info("GEE session persisted for authenticated user")


def get_token(uid: str) -> Optional[dict]:
    """Read from durable storage so other Cloud Run instances see the session."""
    ref = _document(uid)
    try:
        snapshot = ref.get()
        return snapshot.to_dict() if snapshot.exists else None
    except Exception as exc:
        _storage_error("read", exc)


def clear_token(uid: str) -> None:
    """Remove persisted credentials synchronously."""
    ref = _document(uid)
    try:
        ref.delete()
    except Exception as exc:
        _storage_error("delete", exc)
    logger.info("GEE session cleared for authenticated user")
