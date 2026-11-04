"""GeoMoz Explorer billing catalogue and deterministic entitlement rules.

Prices and limits are proposals. Configure production billing only after
commercial review; never trust a client-supplied plan, amount or credits.
"""
from __future__ import annotations

import calendar
from datetime import datetime, timezone
from typing import Any

PLANS: dict[str, dict[str, Any]] = {
    "community": {
        "name": "GeoMoz Community", "monthly_mzn": 0, "annual_mzn": 0,
        "projects": 3, "storage_bytes": 500 * 1024**2, "credits": 20,
        "concurrent_jobs": 1, "seats": 1, "public": True,
        "features": ["gis_core", "map_services", "digitizing", "local_raster", "terrain_3d_basic", "basic_exports"],
        "description": "SIG essencial e ferramentas locais sem mensalidade.",
    },
    "academic": {
        "name": "GeoMoz Academic", "monthly_mzn": 299, "annual_mzn": 2990,
        "projects": 15, "storage_bytes": 5 * 1024**3, "credits": 150,
        "concurrent_jobs": 1, "seats": 1, "public": True,
        "features": ["gis_core", "map_services", "digitizing", "local_raster", "terrain_3d_basic", "basic_exports", "scientific_analysis", "research_exports"],
        "description": "Investigação e análises científicas para membros académicos verificados.",
    },
    "pro": {
        "name": "GeoMoz Pro", "monthly_mzn": 1199, "annual_mzn": 11990,
        "projects": 75, "storage_bytes": 30 * 1024**3, "credits": 800,
        "concurrent_jobs": 2, "seats": 1, "public": True,
        "features": ["gis_core", "map_services", "digitizing", "local_raster", "terrain_3d_basic", "basic_exports", "scientific_analysis", "research_exports", "batch_processing", "high_res_exports"],
        "description": "Geoprocessamento e cartografia profissional.",
    },
    "teams": {
        "name": "GeoMoz Teams", "monthly_mzn": 4999, "annual_mzn": 49990,
        "projects": 200, "storage_bytes": 150 * 1024**3, "credits": 3000,
        "concurrent_jobs": 5, "seats": 5, "public": True,
        "features": ["gis_core", "map_services", "digitizing", "local_raster", "terrain_3d_basic", "basic_exports", "scientific_analysis", "research_exports", "batch_processing", "high_res_exports", "team_workspace", "roles"],
        "description": "Recursos partilhados para equipas técnicas.",
    },
    "enterprise": {
        "name": "GeoMoz Enterprise", "monthly_mzn": None, "annual_mzn": None,
        "projects": None, "storage_bytes": None, "credits": None,
        "concurrent_jobs": None, "seats": None, "public": True,
        "features": ["gis_core", "map_services", "digitizing", "local_raster", "terrain_3d_basic", "basic_exports", "scientific_analysis", "research_exports", "batch_processing", "high_res_exports", "team_workspace", "roles", "enterprise_api", "sso", "sla"],
        "description": "Licenciamento e infraestrutura sob consulta.",
    },
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def monthly_cycle(now: datetime | None = None) -> str:
    return (now or utcnow()).strftime("%Y-%m")


def period_end(start: datetime, interval: str) -> datetime:
    if interval not in ("month", "year"):
        raise ValueError("Intervalo de pagamento inválido.")
    years, months = (1, 0) if interval == "year" else (0, 1)
    y = start.year + years + (start.month - 1 + months) // 12
    m = (start.month - 1 + months) % 12 + 1
    return start.replace(year=y, month=m, day=min(start.day, calendar.monthrange(y, m)[1]))


def current_plan(account: dict[str, Any] | None, now: datetime | None = None) -> str:
    account = account or {}
    key = str(account.get("plan", "community"))
    if key not in PLANS or key == "enterprise" and account.get("status") != "active":
        return "community"
    if key != "community":
        if account.get("status") != "active":
            return "community"
        try:
            expiry = datetime.fromisoformat(str(account["expires_at"]).replace("Z", "+00:00"))
            if expiry.tzinfo is None or expiry <= (now or utcnow()):
                return "community"
        except (ValueError, KeyError, TypeError):
            return "community"
    return key


def public_catalogue() -> list[dict[str, Any]]:
    return [{"id": key, **value} for key, value in PLANS.items() if value["public"]]


def remaining_credits(account: dict[str, Any] | None, now: datetime | None = None) -> int | None:
    key = current_plan(account, now)
    ceiling = PLANS[key]["credits"]
    if ceiling is None:
        return None
    cycle = monthly_cycle(now)
    used = int((account or {}).get("credits_used", 0)) if (account or {}).get("credits_cycle") == cycle else 0
    return max(0, ceiling - used)


def has_feature(account: dict[str, Any] | None, feature: str, now: datetime | None = None) -> bool:
    return feature in PLANS[current_plan(account, now)]["features"]
