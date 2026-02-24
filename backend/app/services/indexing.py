from __future__ import annotations

import json
import mmap
from pathlib import Path

from app.models import FileIndex


class IndexValidationError(ValueError):
    """Raised when line or index inputs are invalid."""


def build_line_offsets(file_path: Path) -> tuple[list[int], int, int]:
    offsets: list[int] = []

    with file_path.open("rb") as handle:
        while True:
            line_start = handle.tell()
            line = handle.readline()
            if not line:
                break
            offsets.append(line_start)
        file_size = handle.tell()

    return offsets, file_size, len(offsets)


def persist_index(file_index: FileIndex) -> None:
    file_index.index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = file_index.to_dict()
    with file_index.index_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)


def load_index(index_path: Path) -> FileIndex:
    with index_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return FileIndex.from_dict(payload, index_path=index_path)


def strip_trailing_newline(text: str) -> str:
    if text.endswith("\n"):
        text = text[:-1]
    if text.endswith("\r"):
        text = text[:-1]
    return text


def decode_line(line_bytes: bytes) -> str:
    return strip_trailing_newline(line_bytes.decode("utf-8"))


def _line_bounds(file_index: FileIndex, line_no: int) -> tuple[int, int]:
    if line_no < 1 or line_no > file_index.total_lines:
        raise IndexValidationError(
            f"line must be between 1 and {file_index.total_lines}, got {line_no}"
        )
    start = file_index.offsets[line_no - 1]
    end = (
        file_index.offsets[line_no]
        if line_no < file_index.total_lines
        else file_index.file_size
    )
    return start, end


def read_line(file_index: FileIndex, line_no: int) -> str:
    start, end = _line_bounds(file_index, line_no)
    with file_index.file_path.open("rb") as handle:
        handle.seek(start)
        raw = handle.read(end - start)
    return decode_line(raw)


def read_context_lines(
    file_index: FileIndex,
    line_no: int,
    radius: int,
) -> list[dict[str, int | str]]:
    if file_index.total_lines == 0:
        raise IndexValidationError("file has no lines")

    if line_no < 1 or line_no > file_index.total_lines:
        raise IndexValidationError(
            f"line must be between 1 and {file_index.total_lines}, got {line_no}"
        )

    start_line = max(1, line_no - radius)
    end_line = min(file_index.total_lines, line_no + radius)

    lines: list[dict[str, int | str]] = []
    with file_index.file_path.open("rb") as handle:
        with mmap.mmap(handle.fileno(), length=0, access=mmap.ACCESS_READ) as mapped:
            for current in range(start_line, end_line + 1):
                byte_start, byte_end = _line_bounds(file_index, current)
                text = decode_line(mapped[byte_start:byte_end])
                lines.append({"line_no": current, "text": text})
    return lines


def split_highlight_segments(text: str, start: int, end: int) -> dict[str, str]:
    if start < 0:
        raise IndexValidationError("start must be >= 0")
    if end < 0:
        raise IndexValidationError("end must be >= 0")
    if end < start:
        raise IndexValidationError("end must be >= start")

    text_length = len(text)
    if start > text_length or end > text_length:
        raise IndexValidationError(
            f"highlight range [{start}, {end}) is out of bounds for line length {text_length}"
        )

    return {
        "pre": text[:start],
        "mid": text[start:end],
        "post": text[end:],
    }

