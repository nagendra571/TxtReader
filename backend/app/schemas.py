from __future__ import annotations

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


class HighlightSpec(BaseModel):
    start: int = Field(ge=0, description="0-based inclusive character offset")
    end: int = Field(ge=0, description="0-based exclusive character offset")


class ContextResponse(BaseModel):
    target_line: int = Field(ge=1)
    radius: int = Field(ge=0)
    total_lines: int = Field(ge=0)
    lines: list[LineItem]


class HighlightResponse(ContextResponse):
    highlight: HighlightSpec

