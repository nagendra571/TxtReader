from __future__ import annotations

import json
import mmap
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.models import FileIndex


class IndexValidationError(ValueError):
    """Raised when line or index inputs are invalid."""


@dataclass(frozen=True)
class NormalizedHighlightRange:
    start0: int
    end0_exclusive: int
    effective_start: int
    effective_end: int
    effective_length: int


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


def scan_record_types(file_index: FileIndex) -> dict[str, int]:
    """Scan all lines and count occurrences of each 2-character record type prefix."""
    counts: dict[str, int] = {}
    if file_index.total_lines == 0:
        return counts
    with file_index.file_path.open("rb") as handle:
        with mmap.mmap(handle.fileno(), length=0, access=mmap.ACCESS_READ) as mapped:
            for line_no in range(1, file_index.total_lines + 1):
                byte_start, byte_end = _line_bounds(file_index, line_no)
                raw = mapped[byte_start:byte_end]
                text = decode_line(raw)
                record_type = text[:2]
                counts[record_type] = counts.get(record_type, 0) + 1
    return counts


def filter_lines_by_record_types(
    file_index: FileIndex,
    record_types: list[str],
) -> list[dict[str, int | str]]:
    """Return all lines whose first two characters match any of the given record types."""
    if file_index.total_lines == 0 or not record_types:
        return []
    target_set = set(record_types)
    results: list[dict[str, int | str]] = []
    with file_index.file_path.open("rb") as handle:
        with mmap.mmap(handle.fileno(), length=0, access=mmap.ACCESS_READ) as mapped:
            for line_no in range(1, file_index.total_lines + 1):
                byte_start, byte_end = _line_bounds(file_index, line_no)
                raw = mapped[byte_start:byte_end]
                text = decode_line(raw)
                if text[:2] in target_set:
                    results.append({"line_no": line_no, "text": text})
    return results


def normalize_highlight_range(
    text: str,
    *,
    index_base: int,
    mode: Literal["end", "length"],
    start: int,
    end: int | None,
    length: int | None,
) -> NormalizedHighlightRange:
    if index_base not in (0, 1):
        raise IndexValidationError("index_base must be 0 or 1")

    min_user_index = 0 if index_base == 0 else 1
    if start < min_user_index:
        raise IndexValidationError(f"start must be >= {min_user_index} for index_base={index_base}")

    start0 = start - index_base

    if mode == "end":
        if end is None:
            raise IndexValidationError("end is required when mode=end")
        if length is not None:
            raise IndexValidationError("length must not be provided when mode=end")
        if end < min_user_index:
            raise IndexValidationError(
                f"end must be >= {min_user_index} for index_base={index_base}"
            )
        # end is inclusive: convert to internal 0-based exclusive
        end0_exclusive = end - index_base + 1
        effective_end = end  # return the user-provided inclusive end as-is
    elif mode == "length":
        if length is None:
            raise IndexValidationError("length is required when mode=length")
        if end is not None:
            raise IndexValidationError("end must not be provided when mode=length")
        if length < 0:
            raise IndexValidationError("length must be >= 0")
        end0_exclusive = start0 + length
        # express as inclusive end in the user's index base
        effective_end = (end0_exclusive - 1 + index_base) if length > 0 else start
    else:
        raise IndexValidationError("mode must be one of: end, length")

    # Reuse segment validation to enforce bounds and ordering against decoded character length.
    split_highlight_segments(text, start0, end0_exclusive)

    return NormalizedHighlightRange(
        start0=start0,
        end0_exclusive=end0_exclusive,
        effective_start=start,
        effective_end=effective_end,
        effective_length=end0_exclusive - start0,
    )
