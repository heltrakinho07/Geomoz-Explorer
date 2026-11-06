"""Regressões das permissões por módulo e por subscrição; sem Firebase real."""
from datetime import timedelta
from types import SimpleNamespace

import pytest

import billing
import platform_config


def test_legacy_module_permissions_default_to_allowed(monkeypatch):
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("GEOMOZ_FEATURE_FLAGS_TEST_MODE", "true")
    config = platform_config.read_config(fresh=True)
    assert set(config["planFeatures"]) == set(platform_config.PLAN_ORDER)
    assert all(
        all(row.values()) for row in config["planFeatures"].values()
    )
    assert platform_config.PLAN_GATED_FEATURES == frozenset(
        {"geo_ai", "hydrology", "terrain_3d", "remote_sensing"}
    )


@pytest.mark.parametrize(("plan", "changes"), [
    ("unknown", {"geo_ai": False}),
    ("pro", {"gis_workspace": False}),
    ("academic", {"seismic_catalogs": False}),
    ("pro", {"nonexistent": True}),
    ("pro", {"geo_ai": "false"}),
    ("pro", {"geo_ai": 0}),
    ("pro", {}),
])
def test_reject_invalid_or_unenforceable_plan_permissions(plan, changes):
    with pytest.raises(ValueError):
        platform_config.update_plan_features(plan, changes)


def test_plan_permission_override_does_not_change_other_plans(monkeypatch):
    class Snapshot:
        exists = True

        def __init__(self, record):
            self.record = record

        def to_dict(self):
            return self.record

    class Doc:
        record = {}

        def get(self):
            return Snapshot(self.record)

        def set(self, payload, merge=False):
            assert merge is True
            for key, mapping in payload.items():
                if key == "planFeatures":
                    self.record.setdefault("planFeatures", {})
                    for plan, changes in mapping.items():
                        self.record["planFeatures"].setdefault(plan, {}).update(changes)
                else:
                    self.record[key] = mapping

    doc = Doc()
    monkeypatch.setattr(platform_config, "_doc", lambda: doc)
    monkeypatch.delenv("CI", raising=False)
    platform_config.invalidate_cache()
    try:
        result = platform_config.update_plan_features("academic", {"geo_ai": False})
        assert result["geo_ai"] is False
        assert result["hydrology"] is True
        config = platform_config.read_config(fresh=True)
        assert config["planFeatures"]["academic"]["geo_ai"] is False
        assert config["planFeatures"]["pro"]["geo_ai"] is True
        assert config["features"]["geo_ai"] is True
    finally:
        platform_config.invalidate_cache()


def test_authenticated_module_access_uses_effective_billing_plan(monkeypatch):
    future = billing._utcnow() + timedelta(days=30)
    state = {"plan": "pro", "status": "active", "periodEnd": future.isoformat()}
    snapshot = SimpleNamespace(exists=True, to_dict=lambda: state)
    monkeypatch.setattr(billing, "_billing_ref", lambda uid: SimpleNamespace(get=lambda: snapshot))
    config = {
        "features": {"geo_ai": True, "hydrology": False},
        "planFeatures": {
            "pro": {"geo_ai": False, "hydrology": True},
            "community": {"geo_ai": True, "hydrology": True},
        },
    }
    monkeypatch.setattr(billing, "read_config", lambda: config)
    result = billing.module_access(uid="verified-user")
    assert result["plan"] == "pro"
    assert result["features"] == {"geo_ai": False, "hydrology": False}

    state["periodEnd"] = (billing._utcnow() - timedelta(days=1)).isoformat()
    result = billing.module_access(uid="verified-user")
    assert result["plan"] == "community"
    assert result["features"]["geo_ai"] is True
