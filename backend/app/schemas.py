from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    total_lines: int


class LineSegments(BaseModel):
    pre: str
    mid: str
    post: str


class LineItem(BaseModel):
    line_no: int
    text: str
    segments: LineSegments | None = None
    line_length: int | None = None


class NormalizedRange(BaseModel):
    start0: int = Field(ge=0, description="0-based inclusive canonical start")
    end0_exclusive: int = Field(ge=0, description="0-based exclusive canonical end")


class ContextResponse(BaseModel):
    file_id: str
    target_line: int = Field(ge=1)
    radius: int = Field(ge=0)
    total_lines: int = Field(ge=0)
    lines: list[LineItem]


class HighlightResponse(ContextResponse):
    index_base: Literal[0, 1]
    mode: Literal["end", "length"]
    effective_start: int
    effective_end: int
    effective_length: int
    normalized: NormalizedRange


class RecordTypesResponse(BaseModel):
    file_id: str
    record_types: dict[str, int] = Field(
        description="Map of record type prefix to line count, sorted by prefix"
    )


class FilteredLinesResponse(BaseModel):
    file_id: str
    record_types: list[str]
    total_matches: int
    lines: list[LineItem]


class CsvStructureResponse(BaseModel):
    file_id: str
    delimiter: str
    headers: list[str]
    has_header: bool
    total_data_rows: int


class CsvDistinctValue(BaseModel):
    value: str
    count: int


class CsvDistinctResponse(BaseModel):
    file_id: str
    column_index: int
    column_name: str
    values: list[CsvDistinctValue]


class CsvRowItem(BaseModel):
    line_no: int
    values: list[str]


class CsvFilterResponse(BaseModel):
    file_id: str
    column_index: int
    column_name: str
    value: str
    match_mode: str
    has_header: bool
    record_type_column_index: int | None = None
    record_type_value: str | None = None
    total_matches: int
    rows: list[CsvRowItem]
