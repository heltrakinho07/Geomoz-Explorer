from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


def test_hillshade_command_is_allowlisted_and_shell_free(tmp_path: Path) -> None:
    from processing_jobs import _gdal_tool_command

    source = tmp_path / "input.tif"
    target = tmp_path / "output.tif"
    command = _gdal_tool_command(
        "hillshade",
        source,
        target,
        {"azimuth": 315, "altitude": 45, "z_factor": 1},
    )

    assert command[0] == "gdaldem"
    assert command[1] == "hillshade"
    assert str(source) in command
    assert str(target) in command
    assert ";" not in " ".join(command)


def test_invalid_backend_tool_is_rejected(tmp_path: Path) -> None:
    from processing_jobs import _gdal_tool_command

    with pytest.raises(ValueError, match="não é suportada"):
        _gdal_tool_command(
            "rm-everything",
            tmp_path / "input.tif",
            tmp_path / "out.tif",
            {},
        )


def test_parameters_must_be_json_object() -> None:
    from processing_jobs import parse_job_parameters

    assert parse_job_parameters('{"azimuth": 300}') == {"azimuth": 300}
    with pytest.raises(ValueError, match="objeto JSON"):
        parse_job_parameters("[1,2,3]")
    with pytest.raises(ValueError, match="JSON válido"):
        parse_job_parameters("{bad")


def test_processing_tools_endpoint(client: TestClient) -> None:
    response = client.get("/geomoz-api/processing/tools")
    assert response.status_code == 200
    payload = response.json()
    ids = {tool["id"] for tool in payload["tools"]}
    assert {"hillshade", "slope", "aspect", "cog"} <= ids
    assert payload["execution"] == "async"


def test_create_processing_job_endpoint_queues_upload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_job = SimpleNamespace(
        id="job-demo",
        public_dict=lambda: {
            "id": "job-demo",
            "tool": "hillshade",
            "status": "queued",
            "progress": 0,
        },
    )
    create_mock = MagicMock(return_value=fake_job)
    monkeypatch.setattr("api.create_processing_job", create_mock)
    monkeypatch.setattr("api.cleanup_expired_jobs", MagicMock(return_value=0))

    response = client.post(
        "/geomoz-api/processing/jobs",
        data={
            "tool": "hillshade",
            "parameters": json.dumps({"azimuth": 300}),
        },
        files={"input_file": ("dem.tif", b"fake-geotiff", "image/tiff")},
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["job"]["id"] == "job-demo"
    assert payload["status_url"].endswith("/job-demo")
    assert payload["result_url"].endswith("/job-demo/result")

    kwargs = create_mock.call_args.kwargs
    assert kwargs["tool"] == "hillshade"
    assert kwargs["input_name"] == "dem.tif"
    assert kwargs["input_bytes"] == b"fake-geotiff"
    assert kwargs["parameters"] == {"azimuth": 300}


def test_create_processing_job_rejects_unknown_tool(client: TestClient) -> None:
    response = client.post(
        "/geomoz-api/processing/jobs",
        data={"tool": "arbitrary-shell", "parameters": "{}"},
        files={"input_file": ("dem.tif", b"x", "image/tiff")},
    )
    assert response.status_code == 400
    assert "não suportada" in response.json()["detail"]


def test_job_status_is_scoped_to_owner(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("api.cleanup_expired_jobs", MagicMock(return_value=0))
    monkeypatch.setattr("api.get_processing_job", MagicMock(return_value=None))

    response = client.get("/geomoz-api/processing/jobs/missing")
    assert response.status_code == 404


def test_completed_result_returns_geotiff(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    output = tmp_path / "hillshade.tif"
    output.write_bytes(b"tiff-result")
    fake_job = SimpleNamespace(
        id="job-ready",
        status="completed",
        error=None,
        output_name="hillshade.tif",
        tool="hillshade",
    )
    monkeypatch.setattr("api.get_processing_job", MagicMock(return_value=fake_job))
    monkeypatch.setattr(
        "api.get_processing_job_output",
        MagicMock(return_value=output),
    )

    response = client.get("/geomoz-api/processing/jobs/job-ready/result")
    assert response.status_code == 200
    assert response.content == b"tiff-result"
    assert response.headers["content-type"].startswith("image/tiff")
