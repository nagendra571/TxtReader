from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class FileIndex:
    file_id: str
    filename: str
    file_path: Path
    index_path: Path
    offsets: list[int]
    file_size: int
    total_lines: int
    created_at_epoch: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_id": self.file_id,
            "filename": self.filename,
            "file_path": str(self.file_path),
            "offsets": self.offsets,
            "file_size": self.file_size,
            "total_lines": self.total_lines,
            "created_at_epoch": self.created_at_epoch,
        }

    @staticmethod
    def from_dict(payload: dict[str, Any], index_path: Path) -> "FileIndex":
        return FileIndex(
            file_id=payload["file_id"],
            filename=payload["filename"],
            file_path=Path(payload["file_path"]),
            index_path=index_path,
            offsets=[int(offset) for offset in payload["offsets"]],
            file_size=int(payload["file_size"]),
            total_lines=int(payload["total_lines"]),
            created_at_epoch=float(payload["created_at_epoch"]),
        )

