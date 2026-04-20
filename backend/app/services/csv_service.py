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
    has_header: bool = True,
) -> dict[str, object]:
    """Return delimiter, column labels, and total data row count.

    When has_header=True the first CSV row is used as column names.
    When has_header=False column names are generated as "Col 0", "Col 1", …
    and every row is counted as a data row.
    """
    delimiter = _sniff_delimiter(file_index)

    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        first_row: list[str] = next(reader, [])
        if has_header:
            headers = first_row
            total_data_rows = sum(1 for _ in reader)
        else:
            headers = [f"Col {i}" for i in range(len(first_row))]
            # first_row is a data row; count the rest
            total_data_rows = 1 + sum(1 for _ in reader)

    return {
        "delimiter": delimiter,
        "headers": headers,
        "has_header": has_header,
        "total_data_rows": total_data_rows,
    }


def get_distinct_column_values(
    file_index: FileIndex,
    delimiter: str,
    column_index: int,
    has_header: bool = True,
) -> list[dict[str, object]]:
    """Return distinct values (with counts) found in the specified column, sorted by value."""
    counts: dict[str, int] = {}
    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        if has_header:
            next(reader, None)  # skip header row
        for row in reader:
            if column_index < len(row):
                val = row[column_index]
                counts[val] = counts.get(val, 0) + 1
    return sorted(
        [{"value": v, "count": c} for v, c in counts.items()],
        key=lambda x: x["value"],
    )


def filter_csv_rows(
    file_index: FileIndex,
    delimiter: str,
    column_index: int,
    value: str,
    match_mode: MatchMode,
    has_header: bool = True,
    record_type_column_index: int | None = None,
    record_type_value: str | None = None,
) -> list[dict[str, object]]:
    """Return rows matching the column/value filter, optionally pre-filtered by record type.

    Line numbers are 1-based. When has_header=True, row 1 is the header so data
    rows start at line 2; otherwise data rows start at line 1.
    """
    results: list[dict[str, object]] = []
    value_lower = value.lower()
    apply_rt = record_type_value is not None and record_type_column_index is not None
    start_line = 2 if has_header else 1

    with file_index.file_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        if has_header:
            next(reader, None)  # skip header row (line 1)
        for line_no, row in enumerate(reader, start=start_line):
            # Pre-filter by record type (exact match)
            if apply_rt:
                if record_type_column_index >= len(row):  # type: ignore[operator]
                    continue
                if row[record_type_column_index] != record_type_value:  # type: ignore[index]
                    continue

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
