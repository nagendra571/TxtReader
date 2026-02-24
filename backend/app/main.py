from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.schemas import (
    ContextResponse,
    HighlightResponse,
    HighlightSpec,
    LineItem,
    LineSegments,
    UploadResponse,
)
from app.services.index_store import IndexStore
from app.services.indexing import (
    IndexValidationError,
    read_context_lines,
    read_line,
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
            target_line=line,
            radius=radius,
            total_lines=file_index.total_lines,
            lines=[LineItem(**item) for item in lines],
        )

    @app.get("/api/files/{file_id}/highlight", response_model=HighlightResponse)
    async def get_highlight(
        file_id: str,
        line: int = Query(..., ge=1, description="1-based line number"),
        start: int = Query(..., ge=0, description="0-based inclusive character start"),
        end: int = Query(..., ge=0, description="0-based exclusive character end"),
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
            segments = split_highlight_segments(target_text, start, end)
        except IndexValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        lines_payload: list[LineItem] = []
        for item in context_lines:
            if item["line_no"] == line:
                line_item = LineItem(
                    line_no=item["line_no"],
                    text=item["text"],
                    segments=LineSegments(**segments),
                )
            else:
                line_item = LineItem(line_no=item["line_no"], text=item["text"])
            lines_payload.append(line_item)

        return HighlightResponse(
            target_line=line,
            radius=radius,
            total_lines=file_index.total_lines,
            highlight=HighlightSpec(start=start, end=end),
            lines=lines_payload,
        )

    return app


app = create_app()
