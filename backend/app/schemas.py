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
