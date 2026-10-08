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



def test_verified_processing_auth_requires_real_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio
    from starlette.requests import Request
    import api

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/geomoz-api/processing/tools",
        "headers": [],
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 12345),
        "scheme": "http",
        "http_version": "1.1",
    }
    request = Request(scope)

    with pytest.raises(Exception) as missing:
        asyncio.run(api.require_verified_firebase_auth(request))
    assert getattr(missing.value, "status_code", None) == 401

    verifier = MagicMock()
    verifier.verify_id_token.return_value = {"uid": "secure-user"}
    monkeypatch.setattr(api, "firebase_auth", verifier)
    scope["headers"] = [(b"authorization", b"Bearer signed-token")]
    request = Request(scope)

    uid = asyncio.run(api.require_verified_firebase_auth(request))
    assert uid == "secure-user"
    verifier.verify_id_token.assert_called_once_with("signed-token")


def test_delete_processing_job_terminates_active_process(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import processing_jobs

    job_id = "job-active"
    uid = "owner-1"
    directory = tmp_path / job_id
    directory.mkdir()

    monkeypatch.setattr(processing_jobs, "JOB_ROOT", tmp_path)

    fake_process = MagicMock()
    fake_process.poll.return_value = None
    fake_process.wait.return_value = 0
    fake_future = MagicMock()
    fake_future.done.return_value = False

    job = processing_jobs.ProcessingJob(
        id=job_id,
        uid=uid,
        tool="hillshade",
        status="running",
        created_at=1,
        updated_at=1,
        input_name="input.tif",
    )

    with processing_jobs._lock:
        processing_jobs._jobs[job_id] = job
        processing_jobs._processes[job_id] = fake_process
        processing_jobs._futures[job_id] = fake_future

    assert processing_jobs.delete_processing_job(job_id, uid) is True
    fake_process.terminate.assert_called_once()
    fake_process.wait.assert_called()
    fake_future.cancel.assert_called_once()
    assert not directory.exists()


def test_delete_processing_job_does_not_cross_user_boundary(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import processing_jobs

    monkeypatch.setattr(processing_jobs, "JOB_ROOT", tmp_path)
    job_id = "job-private"
    with processing_jobs._lock:
        processing_jobs._jobs[job_id] = processing_jobs.ProcessingJob(
            id=job_id,
            uid="owner-a",
            tool="slope",
            status="queued",
            created_at=1,
            updated_at=1,
            input_name="input.tif",
        )

    try:
        assert processing_jobs.delete_processing_job(job_id, "owner-b") is False
        assert processing_jobs.get_processing_job(job_id, "owner-a") is not None
    finally:
        processing_jobs.delete_processing_job(job_id, "owner-a")
