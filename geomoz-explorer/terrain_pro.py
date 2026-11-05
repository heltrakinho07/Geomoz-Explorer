"""Server-authoritative GeoMoz Pro access for paid terrain GEE operations.

Free/Academic users may still upload and analyse local DEMs. Only a valid,
non-expired billing subscription unlocks the remote Copernicus generator.
"""
from fastapi import HTTPException

TERRAIN_GEE_PLANS = frozenset({"pro", "teams", "enterprise"})


def require_terrain_pro_plan(uid: str) -> str:
    if not uid:
        raise HTTPException(status_code=401, detail="Autenticação Firebase necessária.")
    from billing import _billing_ref, _effective_plan
    try:
        snapshot = _billing_ref(uid).get()
        state = snapshot.to_dict() if snapshot.exists else {}
    except HTTPException:
        raise
    except Exception as exc:
        # Billing outages must never accidentally unlock paid GEE compute.
        raise HTTPException(
            status_code=503,
            detail="Não foi possível verificar a subscrição Pro.",
        ) from exc
    plan = _effective_plan(state or {})
    if plan not in TERRAIN_GEE_PLANS:
        raise HTTPException(
            status_code=403,
            detail="A geração do DEM Copernicus pelo GEE requer GeoMoz Pro, Teams ou Enterprise activo.",
        )
    return uid
