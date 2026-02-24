from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _test_settings(tmp_path: Path) -> Settings:
    storage_dir = tmp_path / "storage"
    uploads_dir = storage_dir / "uploads"
    indexes_dir = storage_dir / "indexes"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    indexes_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        app_name="TxtReader Test",
        max_upload_size_bytes=4 * 1024 * 1024,
        max_radius=200,
        file_ttl_seconds=60,
        cleanup_interval_seconds=3600,
        storage_dir=storage_dir,
        uploads_dir=uploads_dir,
        indexes_dir=indexes_dir,
        cors_origins=["http://localhost:5173"],
    )


def test_upload_then_highlight_flow(tmp_path: Path) -> None:
    app = create_app(custom_settings=_test_settings(tmp_path))
    client = TestClient(app)

    data = "line0\nhello world\nline2\n".encode("utf-8")
    upload_response = client.post(
        "/api/files",
        files={"file": ("sample.txt", data, "text/plain")},
    )
    assert upload_response.status_code == 201
    payload = upload_response.json()
    file_id = payload["file_id"]
    assert payload["total_lines"] == 3

    highlight_response = client.get(
        f"/api/files/{file_id}/highlight",
        params={"line": 2, "start": 6, "end": 11, "radius": 1},
    )
    assert highlight_response.status_code == 200
    highlight_payload = highlight_response.json()

    assert highlight_payload["target_line"] == 2
    assert highlight_payload["highlight"] == {"start": 6, "end": 11}
    target_line = next(line for line in highlight_payload["lines"] if line["line_no"] == 2)
    assert target_line["segments"] == {"pre": "hello ", "mid": "world", "post": ""}


def test_highlight_validation_error(tmp_path: Path) -> None:
    app = create_app(custom_settings=_test_settings(tmp_path))
    client = TestClient(app)

    upload_response = client.post(
        "/api/files",
        files={"file": ("sample.txt", b"abc\n", "text/plain")},
    )
    file_id = upload_response.json()["file_id"]

    response = client.get(
        f"/api/files/{file_id}/highlight",
        params={"line": 1, "start": 0, "end": 5, "radius": 1},
    )
    assert response.status_code == 422
    assert "out of bounds" in response.json()["detail"]


def test_upload_rejects_invalid_utf8(tmp_path: Path) -> None:
    app = create_app(custom_settings=_test_settings(tmp_path))
    client = TestClient(app)

    response = client.post(
        "/api/files",
        files={"file": ("invalid.txt", b"\xff\xfe\x00", "text/plain")},
    )
    assert response.status_code == 400
    assert "valid UTF-8" in response.json()["detail"]

