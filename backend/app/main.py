from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.schemas import (
    ContextResponse,
    FilteredLinesResponse,
    HighlightResponse,
    LineItem,
    LineSegments,
    NormalizedRange,
    RecordTypesResponse,
    UploadResponse,
)
from app.services.index_store import IndexStore
from app.services.indexing import (
    IndexValidationError,
    filter_lines_by_record_types,
    normalize_highlight_range,
    read_context_lines,
    read_line,
    scan_record_types,
    split_highlight_segments,
)
from app.services.uploads import save_upload_utf8


async def _cleanup_loop(
    index_store: IndexStore,
    cleanup_interval_seconds: int,
    ttl_seconds: int,
    stop_event: asyncio.Event,
) -> None:
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=cleanup_interval_seconds)
            break
        except TimeoutError:
            await run_in_threadpool(index_store.cleanup_expired, ttl_seconds)


def create_app(custom_settings: Settings | None = None) -> FastAPI:
    settings = custom_settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        index_store = IndexStore(settings)
        await run_in_threadpool(index_store.load_existing_indexes)

        stop_event = asyncio.Event()
        cleanup_task = asyncio.create_task(
            _cleanup_loop(
                index_store=index_store,
                cleanup_interval_seconds=settings.cleanup_interval_seconds,
                ttl_seconds=settings.file_ttl_seconds,
                stop_event=stop_event,
            )
        )

        app.state.settings = settings
        app.state.index_store = index_store
        app.state.cleanup_stop_event = stop_event
        app.state.cleanup_task = cleanup_task
        yield

        stop_event.set()
        cleanup_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await cleanup_task

    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/files", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
    async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
        if not file.filename:
            raise HTTPException(status_code=400, detail="filename is required")
        if not file.filename.lower().endswith(".txt"):
            raise HTTPException(status_code=400, detail="Only .txt files are supported.")

        index_store: IndexStore = app.state.index_store

        file_id = index_store.new_file_id()
        upload_path = index_store.upload_path_for(file_id, file.filename)

        await save_upload_utf8(
            upload=file,
            destination=upload_path,
            max_upload_size_bytes=settings.max_upload_size_bytes,
        )

        file_index = await run_in_threadpool(
            index_store.add_file,
            file_id,
            file.filename,
            upload_path,
        )
        return UploadResponse(
            file_id=file_index.file_id,
            filename=file_index.filename,
            total_lines=file_index.total_lines,
        )

    @app.get("/api/files/{file_id}/context", response_model=ContextResponse)
    async def get_context(
        file_id: str,
        line: int = Query(..., ge=1, description="1-based line number"),
        radius: int = Query(10, ge=0, description="Context radius in lines"),
    ) -> ContextResponse:
        if radius > settings.max_radius:
            raise HTTPException(
                status_code=422,
                detail=f"radius must be <= {settings.max_radius}",
            )

        index_store: IndexStore = app.state.index_store
        file_index = await run_in_threadpool(index_store.get, file_id)
        if file_index is None:
            raise HTTPException(status_code=404, detail="file_id not found")

        try:
            lines = await run_in_threadpool(read_context_lines, file_index, line, radius)
        except IndexValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        return ContextResponse(
            file_id=file_id,
            target_line=line,
            radius=radius,
            total_lines=file_index.total_lines,
            lines=[LineItem(**item) for item in lines],
        )

    @app.get("/api/files/{file_id}/highlight", response_model=HighlightResponse)
    async def get_highlight(
        file_id: str,
        line: int = Query(..., ge=1, description="1-based line number"),
        index_base: int = Query(0, ge=0, le=1, description="Index base, either 0 or 1"),
        mode: Literal["end", "length"] = Query("end", description="Range mode: end or length"),
        start: int = Query(..., description="Start character index in selected base"),
        end: int | None = Query(
            default=None,
            description="End character index (exclusive) in selected base when mode=end",
        ),
        length: int | None = Query(
            default=None,
            description="Highlight length when mode=length",
        ),
        radius: int = Query(10, ge=0, description="Context radius in lines"),
    ) -> HighlightResponse:
        if radius > settings.max_radius:
            raise HTTPException(
                status_code=422,
                detail=f"radius must be <= {settings.max_radius}",
            )

        index_store: IndexStore = app.state.index_store
        file_index = await run_in_threadpool(index_store.get, file_id)
        if file_index is None:
            raise HTTPException(status_code=404, detail="file_id not found")

        try:
            context_lines = await run_in_threadpool(read_context_lines, file_index, line, radius)
            target_text = await run_in_threadpool(read_line, file_index, line)
            normalized = normalize_highlight_range(
                target_text,
                index_base=index_base,
                mode=mode,
                start=start,
                end=end,
                length=length,
            )
            segments = split_highlight_segments(
                target_text,
                normalized.start0,
                normalized.end0_exclusive,
            )
        except IndexValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        lines_payload: list[LineItem] = []
        for item in context_lines:
            if item["line_no"] == line:
                line_item = LineItem(
                    line_no=item["line_no"],
                    text=item["text"],
                    segments=LineSegments(**segments),
                    line_length=len(target_text),
                )
            else:
                line_item = LineItem(line_no=item["line_no"], text=item["text"])
            lines_payload.append(line_item)

        return HighlightResponse(
            file_id=file_id,
            target_line=line,
            radius=radius,
            total_lines=file_index.total_lines,
            index_base=index_base,
            mode=mode,
            effective_start=normalized.effective_start,
            effective_end=normalized.effective_end,
            effective_length=normalized.effective_length,
            normalized=NormalizedRange(
                start0=normalized.start0,
                end0_exclusive=normalized.end0_exclusive,
            ),
            lines=lines_payload,
        )

    @app.get("/api/files/{file_id}/record-types", response_model=RecordTypesResponse)
    async def get_record_types(file_id: str) -> RecordTypesResponse:
        index_store: IndexStore = app.state.index_store
        file_index = await run_in_threadpool(index_store.get, file_id)
        if file_index is None:
            raise HTTPException(status_code=404, detail="file_id not found")

        counts = await run_in_threadpool(scan_record_types, file_index)
        # Return sorted by record type prefix for deterministic ordering
        sorted_counts = dict(sorted(counts.items()))
        return RecordTypesResponse(file_id=file_id, record_types=sorted_counts)

    @app.get("/api/files/{file_id}/filter", response_model=FilteredLinesResponse)
    async def filter_by_record_type(
        file_id: str,
        record_type: list[str] = Query(..., description="Record type prefix(es) to filter by"),
    ) -> FilteredLinesResponse:
        index_store: IndexStore = app.state.index_store
        file_index = await run_in_threadpool(index_store.get, file_id)
        if file_index is None:
            raise HTTPException(status_code=404, detail="file_id not found")

        lines = await run_in_threadpool(filter_lines_by_record_types, file_index, record_type)
        return FilteredLinesResponse(
            file_id=file_id,
            record_types=record_type,
            total_matches=len(lines),
            lines=[LineItem(**item) for item in lines],
        )

    return app


app = create_app()
