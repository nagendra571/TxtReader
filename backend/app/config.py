from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str
    max_upload_size_bytes: int
    max_radius: int
    file_ttl_seconds: int
    cleanup_interval_seconds: int
    storage_dir: Path
    uploads_dir: Path
    indexes_dir: Path
    cors_origins: list[str]


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer.") from exc


def _parse_cors_origins(raw: str) -> list[str]:
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:5173", "http://127.0.0.1:5173"]


def get_settings() -> Settings:
    backend_root = Path(__file__).resolve().parents[1]
    storage_dir = Path(os.getenv("TXT_READER_STORAGE_DIR", backend_root / "storage"))
    uploads_dir = Path(os.getenv("TXT_READER_UPLOADS_DIR", storage_dir / "uploads"))
    indexes_dir = Path(os.getenv("TXT_READER_INDEXES_DIR", storage_dir / "indexes"))

    uploads_dir.mkdir(parents=True, exist_ok=True)
    indexes_dir.mkdir(parents=True, exist_ok=True)

    max_upload_mb = _int_env("TXT_READER_MAX_UPLOAD_MB", 128)
    return Settings(
        app_name="TxtReader API",
        max_upload_size_bytes=max_upload_mb * 1024 * 1024,
        max_radius=_int_env("TXT_READER_MAX_RADIUS", 200),
        file_ttl_seconds=_int_env("TXT_READER_FILE_TTL_SECONDS", 24 * 60 * 60),
        cleanup_interval_seconds=_int_env("TXT_READER_CLEANUP_INTERVAL_SECONDS", 30 * 60),
        storage_dir=storage_dir,
        uploads_dir=uploads_dir,
        indexes_dir=indexes_dir,
        cors_origins=_parse_cors_origins(
            os.getenv(
                "TXT_READER_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            )
        ),
    )

