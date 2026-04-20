from __future__ import annotations

import csv
from typing import Literal

from app.models import FileIndex


MatchMode = Literal["exact", "contains", "starts_with"]


def _sniff_delimiter(file_index: FileIndex) -> str:
    """Read a sample from the file and sniff the CSV delimiter."""
    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        sample = handle.read(8192)
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;")
        return dialect.delimiter
    except csv.Error:
        return ","


def detect_csv_structure(
    file_index: FileIndex,
) -> dict[str, object]:
    """Return delimiter, headers (first row), and total data row count."""
    delimiter = _sniff_delimiter(file_index)

    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        headers: list[str] = next(reader, [])
        total_data_rows = sum(1 for _ in reader)

    return {
        "delimiter": delimiter,
        "headers": headers,
        "total_data_rows": total_data_rows,
    }


def filter_csv_rows(
    file_index: FileIndex,
    delimiter: str,
    column_index: int,
    value: str,
    match_mode: MatchMode,
) -> list[dict[str, object]]:
    """Return rows where the specified column matches value per match_mode.

    Line numbers are 1-based; line 1 is the header row so data rows start at 2.
    """
    results: list[dict[str, object]] = []
    value_lower = value.lower()

    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        next(reader, None)  # skip header row (line 1)
        for line_no, row in enumerate(reader, start=2):
            if column_index >= len(row):
                continue
            cell = row[column_index]
            cell_lower = cell.lower()
            matched = (
                cell == value
                if match_mode == "exact"
                else value_lower in cell_lower
                if match_mode == "contains"
                else cell_lower.startswith(value_lower)
            )
            if matched:
                results.append({"line_no": line_no, "values": row})

    return results
