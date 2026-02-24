from __future__ import annotations

from pathlib import Path

from app.models import FileIndex
from app.services.indexing import (
    build_line_offsets,
    read_context_lines,
    read_line,
    split_highlight_segments,
)


def _make_index(file_path: Path, file_id: str = "test-file") -> FileIndex:
    offsets, file_size, total_lines = build_line_offsets(file_path)
    return FileIndex(
        file_id=file_id,
        filename=file_path.name,
        file_path=file_path,
        index_path=file_path.with_suffix(".idx"),
        offsets=offsets,
        file_size=file_size,
        total_lines=total_lines,
        created_at_epoch=0.0,
    )


def test_build_line_offsets_small_sample(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.txt"
    file_path.write_bytes(b"alpha\nbeta\r\ngamma")

    offsets, file_size, total_lines = build_line_offsets(file_path)

    assert offsets == [0, 6, 12]
    assert file_size == len(b"alpha\nbeta\r\ngamma")
    assert total_lines == 3


def test_build_line_offsets_large_simulated(tmp_path: Path) -> None:
    file_path = tmp_path / "large.txt"
    line_count = 100_000

    with file_path.open("w", encoding="utf-8", newline="\n") as handle:
        for i in range(1, line_count + 1):
            handle.write(f"line-{i}\n")

    offsets, _, total_lines = build_line_offsets(file_path)
    assert total_lines == line_count
    assert len(offsets) == line_count
    assert offsets[0] == 0
    assert offsets[1] > offsets[0]
    assert offsets[-1] > offsets[-2]


def test_read_line_by_number(tmp_path: Path) -> None:
    file_path = tmp_path / "lines.txt"
    file_path.write_text("first\nsecond\nthird", encoding="utf-8")
    file_index = _make_index(file_path)

    assert read_line(file_index, 1) == "first"
    assert read_line(file_index, 2) == "second"
    assert read_line(file_index, 3) == "third"


def test_highlight_segmentation_utf8_chars() -> None:
    text = "A🙂BCé"
    segments = split_highlight_segments(text, start=1, end=4)

    assert segments["pre"] == "A"
    assert segments["mid"] == "🙂BC"
    assert segments["post"] == "é"


def test_read_context_handles_crlf_and_lf(tmp_path: Path) -> None:
    file_path = tmp_path / "mixed.txt"
    file_path.write_bytes(b"one\r\ntwo\nthree\r\nfour")
    file_index = _make_index(file_path)

    context = read_context_lines(file_index, line_no=2, radius=1)
    assert context == [
        {"line_no": 1, "text": "one"},
        {"line_no": 2, "text": "two"},
        {"line_no": 3, "text": "three"},
    ]


def test_highlight_rejects_out_of_bounds() -> None:
    text = "hello"
    try:
        split_highlight_segments(text, start=1, end=10)
    except ValueError as exc:
        assert "out of bounds" in str(exc)
    else:
        raise AssertionError("Expected split_highlight_segments to reject invalid range.")

