"""Private binary assets attached to GeoMoz project outputs.

Assets live in Firebase / Google Cloud Storage, while Firestore stores only
their private object path and metadata. No public ACL or signed URL is created.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


def storage_status() -> dict[str, Any]:
    bucket_name = _bucket_name()
    return {
        "configured": bool(bucket_name),
        "bucket": bucket_name,
        "public": False,
    }


def _bucket_name() -> Optional[str]:
    explicit = (
        os.environ.get("GEOMOZ_STORAGE_BUCKET", "").strip()
        or os.environ.get("FIREBASE_STORAGE_BUCKET", "").strip()
    )
    if explicit:
        return explicit

    try:
        import firebase_admin
        app = firebase_admin.get_app()
        project_id = getattr(app, "project_id", None)
        if project_id:
            return f"{project_id}.firebasestorage.app"
    except Exception:
        pass

    project_id = (
        os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
        or os.environ.get("GCLOUD_PROJECT", "").strip()
    )
    return f"{project_id}.firebasestorage.app" if project_id else None


def _bucket():
    bucket_name = _bucket_name()
    if not bucket_name:
        return None

    try:
        from firebase_admin import storage
        return storage.bucket(bucket_name)
    except Exception as exc:
        logger.warning("Project asset storage unavailable: %s", exc)
        return None


def output_map_path(uid: str, project_id: str, output_id: str) -> str:
    return (
        f"users/{uid}/projects/{project_id}/outputs/"
        f"{output_id}/map.png"
    )


def upload_png(path: str, data: bytes) -> Optional[dict[str, Any]]:
    """Upload one private PNG and return durable metadata."""
    if not data:
        return None

    bucket = _bucket()
    if bucket is None:
        return None

    try:
        blob = bucket.blob(path)
        blob.cache_control = "private, max-age=3600"
        blob.metadata = {
            "geomoz_asset": "project_output_map",
        }
        blob.upload_from_string(data, content_type="image/png")
        return {
            "storage_path": path,
            "content_type": "image/png",
            "size_bytes": len(data),
        }
    except Exception as exc:
        logger.warning("Could not upload project asset %s: %s", path, exc)
        return None


def download_bytes(path: str) -> Optional[bytes]:
    if not path:
        return None

    bucket = _bucket()
    if bucket is None:
        return None

    try:
        blob = bucket.blob(path)
        if not blob.exists():
            return None
        return blob.download_as_bytes()
    except Exception as exc:
        logger.warning("Could not download project asset %s: %s", path, exc)
        return None


def delete_asset(path: str) -> bool:
    if not path:
        return False

    bucket = _bucket()
    if bucket is None:
        return False

    try:
        blob = bucket.blob(path)
        if blob.exists():
            blob.delete()
        return True
    except Exception as exc:
        logger.warning("Could not delete project asset %s: %s", path, exc)
        return False
