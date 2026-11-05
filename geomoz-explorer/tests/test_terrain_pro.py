"""GEE DEM tier enforcement and bounded Pro acquisition tests.

All tests use fake billing/EE data: no external account, Firestore or satellite
downloads are needed.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import billing
import terrain_pro
import terrain_gee


class FakeBillingDocument:
    def __init__(self, state):
        self.state = state
        self.exists = state is not None

    def to_dict(self):
        return self.state


def with_billing(monkeypatch, state):
    monkeypatch.setattr(
        billing, "_billing_ref",
        lambda uid: SimpleNamespace(get=lambda: FakeBillingDocument(state))
    )


def paid_state(plan, days=30, status="active"):
    return {
        "plan": plan,
        "status": status,
        "periodEnd": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
    }


@pytest.mark.parametrize("plan,allowed", [
    ("community", False), ("academic", False), ("pro", True),
    ("teams", True), ("enterprise", True),
])
def test_pro_entitlement_uses_server_billing(monkeypatch, plan, allowed):
    with_billing(monkeypatch, paid_state(plan))
    if allowed:
        assert terrain_pro.require_terrain_pro_plan("user-verified") == "user-verified"
    else:
        with pytest.raises(HTTPException) as err:
            terrain_pro.require_terrain_pro_plan("user-verified")
        assert err.value.status_code == 403


@pytest.mark.parametrize("state", [
    paid_state("pro", days=-1),
    paid_state("pro", status="past_due"),
    paid_state("teams", status="cancelled"),
    {"plan": "enterprise", "status": "active"},
    None,
])
def test_pro_entitlement_rejects_expired_or_missing_memberships(monkeypatch, state):
    with_billing(monkeypatch, state)
    with pytest.raises(HTTPException) as err:
        terrain_pro.require_terrain_pro_plan("user-verified")
    assert err.value.status_code == 403


def test_pro_entitlement_fails_closed_on_billing_outage(monkeypatch):
    def fail(uid):
        raise RuntimeError("Firestore unavailable")
    monkeypatch.setattr(billing, "_billing_ref", fail)
    with pytest.raises(HTTPException) as err:
        terrain_pro.require_terrain_pro_plan("verified")
    assert err.value.status_code == 503


AOI = {
    "type": "Polygon",
    "coordinates": [[[32.0, -25.0], [32.8, -25.0],
                     [32.8, -24.2], [32.0, -24.2], [32.0, -25.0]]]
}


def test_copernicus_quality_preserves_native_resolution_floor():
    scales = {q:terrain_gee.preview_scale_m(AOI, q)
              for q in ("standard", "detailed", "maximum")}
    assert 30 <= scales["maximum"] <= scales["detailed"] <= scales["standard"]
    with pytest.raises(Exception, match="Qualidade"):
        terrain_gee.preview_scale_m(AOI, "unbounded")


def test_copernicus_rejects_global_extent_to_prevent_large_export():
    worldwide = {"type": "Polygon", "coordinates": [
        [[-175, -80], [175, -80], [175, 80], [-175, 80], [-175, -80]]
    ]}
    with pytest.raises(Exception, match="extensa"):
        terrain_gee.preview_scale_m(worldwide, "maximum")


def test_copernicus_preview_reports_quality_without_upscaling(monkeypatch):
    import gee_module
    received = []
    def download(index, region, scale):
        received.append((index,scale))
        return {"downloadUrl":"https://earthengine.googleapis.com/fake"}
    monkeypatch.setattr(gee_module, "get_index_download_url", download)
    monkeypatch.setattr(terrain_gee, "fetch_signed_gee_geotiff", lambda url:b"tiff-bytes")
    monkeypatch.setattr(terrain_gee, "dem_to_preview", lambda raw,name:{"width":12,"heights":[1]*144})
    result = terrain_gee.copernicus_to_preview(AOI, "detailed")
    assert received[0] == ("elevation", result["geeExportScaleMeters"])
    assert result["geePreviewQuality"] == "detailed"
    assert result["geeNativeResolutionMeters"] == 30


def test_direct_terrain_dependency_checks_plan_before_gee_credentials(monkeypatch):
    import api
    stages = []
    async def verified_user(request):
        stages.append("firebase")
        return "user-verified"
    async def credentials(request):
        stages.append("gee")
        return "user-verified"
    def denied(uid):
        stages.append("subscription")
        raise HTTPException(403, "Pro required")
    monkeypatch.setattr(api, "require_firebase_auth", verified_user)
    monkeypatch.setattr(api, "require_gee_auth", credentials)
    monkeypatch.setattr(terrain_pro, "require_terrain_pro_plan", denied)
    with pytest.raises(HTTPException) as err:
        asyncio.run(api.require_pro_gee_auth(None))
    assert err.value.status_code == 403
    assert stages == ["firebase","subscription"]


def test_generic_gee_elevation_export_cannot_bypass_pro(monkeypatch):
    import api
    def denied(uid):
        raise HTTPException(403, "Pro required")
    monkeypatch.setattr(terrain_pro, "require_terrain_pro_plan", denied)
    with pytest.raises(HTTPException) as err:
        asyncio.run(api.gee_download_url(api.GEEDownloadRequest(index="elevation"), uid="user"))
    assert err.value.status_code == 403
