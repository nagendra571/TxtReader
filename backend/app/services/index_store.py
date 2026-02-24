from __future__ import annotations

import threading
import time
from pathlib import Path
from uuid import uuid4

from app.config import Settings
from app.models import FileIndex
from app.services.indexing import build_line_offsets, load_index, persist_index


class IndexStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._cache: dict[str, FileIndex] = {}
        self._lock = threading.RLock()

    def _index_path(self, file_id: str) -> Path:
        return self.settings.indexes_dir / f"{file_id}.idx"

    def _upload_path(self, file_id: str, filename: str) -> Path:
        sanitized = Path(filename).name
        return self.settings.uploads_dir / f"{file_id}_{sanitized}"

    def new_file_id(self) -> str:
        return str(uuid4())

    def upload_path_for(self, file_id: str, filename: str) -> Path:
        return self._upload_path(file_id, filename)

    def add_file(self, file_id: str, filename: str, file_path: Path) -> FileIndex:
        offsets, file_size, total_lines = build_line_offsets(file_path)
        file_index = FileIndex(
            file_id=file_id,
            filename=filename,
            file_path=file_path,
            index_path=self._index_path(file_id),
            offsets=offsets,
            file_size=file_size,
            total_lines=total_lines,
            created_at_epoch=time.time(),
        )
        persist_index(file_index)
        with self._lock:
            self._cache[file_id] = file_index
        return file_index

    def get(self, file_id: str) -> FileIndex | None:
        with self._lock:
            cached = self._cache.get(file_id)
        if cached is not None:
            return cached

        index_path = self._index_path(file_id)
        if not index_path.exists():
            return None

        file_index = load_index(index_path)
        if not file_index.file_path.exists():
            return None

        with self._lock:
            self._cache[file_id] = file_index
        return file_index

    def load_existing_indexes(self) -> None:
        for idx_file in self.settings.indexes_dir.glob("*.idx"):
            try:
                file_index = load_index(idx_file)
            except (OSError, ValueError):
                continue
            if not file_index.file_path.exists():
                continue
            with self._lock:
                self._cache[file_index.file_id] = file_index

    def delete(self, file_id: str) -> None:
        with self._lock:
            file_index = self._cache.pop(file_id, None)
        if file_index is None:
            idx_path = self._index_path(file_id)
            if idx_path.exists():
                idx_path.unlink(missing_ok=True)
            return

        file_index.file_path.unlink(missing_ok=True)
        file_index.index_path.unlink(missing_ok=True)

    def cleanup_expired(self, ttl_seconds: int) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            file_ids = list(self._cache.keys())

        for file_id in file_ids:
            file_index = self.get(file_id)
            if file_index is None:
                continue
            age = now - file_index.created_at_epoch
            if age > ttl_seconds:
                self.delete(file_id)
                removed += 1

        # Catch orphaned index files not loaded in cache.
        for idx_file in self.settings.indexes_dir.glob("*.idx"):
            try:
                file_index = load_index(idx_file)
            except (OSError, ValueError):
                idx_file.unlink(missing_ok=True)
                continue
            age = now - file_index.created_at_epoch
            if age > ttl_seconds:
                file_index.file_path.unlink(missing_ok=True)
                idx_file.unlink(missing_ok=True)
                removed += 1

        return removed

