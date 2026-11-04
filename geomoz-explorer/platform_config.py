"""Central server-owned plan catalogue and module availability for GeoMoz.

Firestore platformConfig/commerce is the sole mutable configuration document.
Public endpoints may expose catalogue and module availability, never credentials.
"""
import os
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

try:
    from firebase_admin import firestore
except ImportError:  # Minimal CI installs do not ship Firebase Admin.
    firestore = None

PLAN_ORDER = ("community", "academic", "pro", "teams", "enterprise")
GB = 1024 ** 3
DEFAULT_PLANS = {
    "community": {"name": "Community", "enabled": True, "monthlyMzn": 0, "yearlyMzn": 0, "projects": 3, "storageBytes": GB // 2, "credits": 20, "seats": 1, "concurrentJobs": 1},
    "academic": {"name": "Academic", "enabled": True, "monthlyMzn": 299, "yearlyMzn": 2990, "projects": 15, "storageBytes": 5 * GB, "credits": 150, "seats": 1, "concurrentJobs": 1},
    "pro": {"name": "Pro", "enabled": True, "monthlyMzn": 1199, "yearlyMzn": 11990, "projects": 75, "storageBytes": 30 * GB, "credits": 800, "seats": 1, "concurrentJobs": 2},
    "teams": {"name": "Teams", "enabled": True, "monthlyMzn": 4999, "yearlyMzn": 49990, "projects": 200, "storageBytes": 150 * GB, "credits": 3000, "seats": 5, "concurrentJobs": 5},
    "enterprise": {"name": "Enterprise", "enabled": True, "monthlyMzn": None, "yearlyMzn": None, "projects": None, "storageBytes": None, "credits": None, "seats": None, "concurrentJobs": None},
}
FEATURE_LABELS = {
    "gis_workspace": "GIS Workspace",
    "geo_ai": "GeoMoz AI Agent",
    "hydrology": "Hidrologia",
    "terrain_3d": "Terreno 3D",
    "remote_sensing": "Detecção Remota",
    "seismic_catalogs": "Catálogos Sísmicos",
}
DEFAULT_FEATURES = {key: True for key in FEATURE_LABELS}
ALLOWED_PLAN_FIELDS = frozenset({
    "enabled", "monthlyMzn", "yearlyMzn", "projects", "storageBytes",
    "credits", "seats", "concurrentJobs",
})
_CACHE_TTL = 12.0
_cache_lock = Lock()
_cached = {"until": 0.0, "value": None}


def _doc():
    return firestore.client().collection("platformConfig").document("commerce")


def read_config(*, fresh=False):
    # The lightweight Python CI installs FastAPI without firebase-admin.
    # Use immutable defaults in this explicitly marked CI environment only.
    # Production retains fail-closed behaviour when Firestore cannot be read.
    if firestore is None and os.environ.get("CI", "").lower() == "true":
        return {"plans": deepcopy(DEFAULT_PLANS), "features": deepcopy(DEFAULT_FEATURES)}
    now = monotonic()
    with _cache_lock:
        if not fresh and _cached["value"] is not None and now < _cached["until"]:
            return deepcopy(_cached["value"])
    snap = _doc().get()
    data = snap.to_dict() if snap.exists else {}
    if not isinstance(data, dict):
        data = {}
    raw_plans = data.get("plans") if isinstance(data.get("plans"), dict) else {}
    plans = {}
    for code, defaults in DEFAULT_PLANS.items():
        override = raw_plans.get(code) if isinstance(raw_plans.get(code), dict) else {}
        plans[code] = {**defaults, **{k: v for k, v in override.items() if k in ALLOWED_PLAN_FIELDS}}
    raw_features = data.get("features") if isinstance(data.get("features"), dict) else {}
    features = {k: raw_features.get(k, v) if isinstance(raw_features.get(k, v), bool) else v
                for k, v in DEFAULT_FEATURES.items()}
    result = {"plans": plans, "features": features}
    with _cache_lock:
        _cached.update(value=deepcopy(result), until=monotonic() + _CACHE_TTL)
    return result


def invalidate_cache():
    with _cache_lock:
        _cached.update(value=None, until=0.0)


def get_plan_config(code):
    if code not in DEFAULT_PLANS:
        raise ValueError("Plano desconhecido.")
    return read_config()["plans"][code]


def get_plan_limits(code):
    plan = get_plan_config(code)
    return {
        "projects": plan["projects"], "storage_bytes": plan["storageBytes"],
        "credits": plan["credits"], "seats": plan["seats"],
        "concurrent_jobs": plan["concurrentJobs"],
    }


def get_features():
    return read_config()["features"]


def update_plan_config(code, changes):
    if code not in DEFAULT_PLANS or code == "community":
        raise ValueError("O plano Community não pode ser alterado.")
    if not changes or set(changes) - ALLOWED_PLAN_FIELDS:
        raise ValueError("Campos do plano não autorizados.")
    if code == "enterprise" and ("monthlyMzn" in changes or "yearlyMzn" in changes):
        raise ValueError("Enterprise usa orçamento institucional.")
    for key, value in changes.items():
        if key == "enabled":
            if not isinstance(value, bool):
                raise ValueError("O estado tem de ser verdadeiro ou falso.")
        elif value is not None:
            if type(value) is not int or value < 0:
                raise ValueError("Limites e preços devem ser números inteiros não negativos.")
            if key in ("monthlyMzn", "yearlyMzn") and not (1 <= value <= 100_000_000):
                raise ValueError("Preço fora dos limites permitidos.")
            if key not in ("monthlyMzn", "yearlyMzn") and value > 10**15:
                raise ValueError("Limite acima do máximo permitido.")
        elif key in ("monthlyMzn", "yearlyMzn") and code != "enterprise":
            raise ValueError("Planos comerciais precisam de preços numéricos.")
    # Firestore recursively merges nested maps, avoiding cross-plan lost writes.
    _doc().set({"plans": {code: changes},
                "updatedAt": datetime.now(timezone.utc).isoformat()}, merge=True)
    invalidate_cache()
    return read_config(fresh=True)["plans"][code]


def update_features(changes):
    if not changes or set(changes) - set(DEFAULT_FEATURES):
        raise ValueError("Módulo desconhecido.")
    if any(not isinstance(v, bool) for v in changes.values()):
        raise ValueError("As funcionalidades recebem apenas valores booleanos.")
    _doc().set({"features": changes,
                "updatedAt": datetime.now(timezone.utc).isoformat()}, merge=True)
    invalidate_cache()
    return get_features()


def blocked_api_module(path):
    """Block known module API endpoints; all other routes remain unchanged."""
    if path.startswith("/geomoz-api/ai/"):
        return "geo_ai"
    if path.startswith("/geomoz-api/terrain/"):
        return "terrain_3d"
    if path.startswith("/geomoz-api/gee/"):
        name = path[len("/geomoz-api/gee/"):].split("/", 1)[0]
        if name in ("basins", "basin-stats", "basin-report", "refresh-basin-tiles", "drainage",
                    "river-network", "watershed", "groundwater"):
            return "hydrology"
        if name in ("index", "render", "composite", "minerals", "targeting", "profile",
                    "contours", "topo-classes", "landcover", "flood", "erosion", "wildfire",
                    "drought", "burned-area", "soil-moisture", "spi-ndvi",
                    "embedding", "lineaments"):
            return "remote_sensing"
    return None
