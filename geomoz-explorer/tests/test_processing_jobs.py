from __future__ import annotations

import io
import json
from concurrent.futures import Future
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
    def create_job_mock(**kwargs):
        assert kwargs["input_stream"].read() == b"fake-geotiff"
        return fake_job

    create_mock = MagicMock(side_effect=create_job_mock)
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
    assert "input_bytes" not in kwargs
    assert "input_stream" in kwargs
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


class DeferredExecutor:
    """Do not launch GDAL in unit tests; keep each job queued."""

    def submit(self, fn, *args):
        return Future()


def test_stream_upload_checks_magic_and_owner_isolation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import processing_jobs as jobs

    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "_executor", DeferredExecutor())
    source = io.BytesIO(b"II*\\x00" + b"raster-data")
    job = jobs.create_processing_job(
        uid="municipio-a",
        tool="hillshade",
        input_name="../dem.tif",
        input_stream=source,
        parameters={"azimuth": 315},
    )
    assert job.status == "queued"
    assert job.input_name == "dem.tif"
    assert (tmp_path / job.id / "dem.tif").read_bytes() == b"II*\\x00raster-data"
    assert jobs.get_processing_job(job.id, "municipio-a") is not None
    assert jobs.get_processing_job(job.id, "municipio-b") is None
    assert jobs.get_processing_job_output(job.id, "municipio-b") is None
    assert not jobs.delete_processing_job(job.id, "municipio-b")
    assert jobs.delete_processing_job(job.id, "municipio-a")
    assert not (tmp_path / job.id).exists()


def test_bounded_upload_rejects_oversize_and_releases_reservation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import processing_jobs as jobs

    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "MAX_UPLOAD_BYTES", 8)
    monkeypatch.setattr(jobs, "_executor", DeferredExecutor())
    old_ids = set(jobs._jobs)
    with pytest.raises(ValueError, match="limite"):
        jobs.create_processing_job(
            uid="stream-user", tool="aspect", input_name="test.tif",
            input_stream=io.BytesIO(b"II*\\x00" + b"x" * 30),
        )
    assert set(jobs._jobs) == old_ids
    assert list(tmp_path.iterdir()) == []


def test_quotas_and_timeout_reject_unbounded_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import processing_jobs as jobs

    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "_executor", DeferredExecutor())
    monkeypatch.setattr(jobs, "_MAX_ACTIVE_PER_USER", 1)
    first = jobs.create_processing_job(
        uid="quota-user", tool="slope", input_name="dem.tif",
        input_bytes=b"II*\\x00" + b"small-raster",
    )
    try:
        with pytest.raises(ValueError, match="por utilizador"):
            jobs.create_processing_job(
                uid="quota-user", tool="slope", input_name="dem.tif",
                input_bytes=b"II*\\x00" + b"small-raster",
            )
        with pytest.raises(ValueError, match="timeout_seconds"):
            jobs.create_processing_job(
                uid="quota-user-2", tool="hillshade", input_name="dem.tif",
                input_bytes=b"II*\\x00" + b"small-raster",
                parameters={"timeout_seconds": jobs.MAX_TIMEOUT_SECONDS + 1},
            )
    finally:
        assert jobs.delete_processing_job(first.id, "quota-user")


def test_cannot_expire_active_jobs_or_accept_unbounded_numeric_parameters(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import processing_jobs as jobs

    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "_executor", DeferredExecutor())
    job = jobs.create_processing_job(
        uid="ttl-user", tool="aspect", input_name="dem.tif",
        input_bytes=b"II*\\x00" + b"small-raster",
    )
    try:
        assert jobs.cleanup_expired_jobs(now=job.updated_at + jobs.JOB_TTL_SECONDS + 1) == 0
        with pytest.raises(ValueError, match="azimuth"):
            jobs._gdal_tool_command(
                "hillshade", tmp_path / "i", tmp_path / "o",
                {"azimuth": float("nan")},
            )
        with pytest.raises(ValueError, match="scale"):
            jobs._gdal_tool_command(
                "slope", tmp_path / "i", tmp_path / "o",
                {"scale": float("inf")},
            )
    finally:
        jobs.delete_processing_job(job.id, "ttl-user")


def test_running_job_delete_terminates_process_before_file_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import processing_jobs as jobs

    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "_executor", DeferredExecutor())
    job = jobs.create_processing_job(
        uid="cancel-user", tool="slope", input_name="dem.tif",
        input_bytes=b"II*\\x00" + b"small-raster",
    )
    process = MagicMock()
    process.poll.return_value = None
    running = jobs._futures[job.id]
    assert running.set_running_or_notify_cancel()
    jobs._processes[job.id] = process
    assert jobs.delete_processing_job(job.id, "cancel-user")
    process.terminate.assert_called_once()
    # The input stays available until the GDAL worker exits.
    assert (tmp_path / job.id / "dem.tif").exists()
    assert jobs.get_processing_job(job.id, "cancel-user") is None
    jobs._processes.pop(job.id, None)
    jobs._futures.pop(job.id, None)
    jobs._cancellations.pop(job.id, None)
    jobs._job_dir(job.id).joinpath("dem.tif").unlink()
    jobs._job_dir(job.id).rmdir()
