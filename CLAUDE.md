# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate       # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run tests:
```bash
cd backend && pytest
```

Run a single test file:
```bash
cd backend && pytest tests/test_indexing.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev         # dev server at http://localhost:5173
npm run build       # tsc -b && vite build
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
```

### Test data

```bash
python scripts/generate_sample_txt.py --output sample_100k.txt --lines 100000
```

## Architecture

### Data flow

1. **Upload** — `POST /api/files` streams the file through `save_upload_utf8` (UTF-8 validation), stores it under `backend/storage/uploads/{file_id}_<name>.txt`.
2. **Indexing** — `build_line_offsets` scans the file once and records byte offsets for every line start. The resulting `FileIndex` is persisted as `backend/storage/indexes/{file_id}.idx` (JSON) and held in `IndexStore` (in-memory dict).
3. **Random access** — `read_context_lines` opens the file with `mmap` and jumps directly to the needed byte ranges; no full-file load.
4. **Highlight** — `normalize_highlight_range` converts user-facing (index_base, mode) to `(start0, end0_exclusive)` (always 0-based exclusive). `split_highlight_segments` slices the decoded line into `{pre, mid, post}` for the response.

### Key invariants (preserved everywhere)

- Line numbers are always **1-based** internally.
- Backend canonical range is always **0-based, end exclusive** (internal only — `end0_exclusive`).
- `index_base` (0 or 1) and `mode` (`end` | `length`) are user-facing only; they are normalized before any slice operation.
- In `end` mode the user-provided `end` is **inclusive**; `normalize_highlight_range` adds 1 internally to get `end0_exclusive`. `effective_end` in the response is always the **inclusive** end in the user's index base.
- Space→dot visualization is a **display-only** transform — it does not affect index mapping.

### Backend module layout

| File | Responsibility |
|------|---------------|
| `app/main.py` | FastAPI app factory, routes, lifespan (cleanup loop) |
| `app/config.py` | `Settings` (Pydantic), env var names |
| `app/models.py` | `FileIndex` dataclass (offsets, paths, total_lines) |
| `app/schemas.py` | Pydantic response models |
| `app/services/indexing.py` | `build_line_offsets`, `read_line`, `read_context_lines`, `normalize_highlight_range`, `split_highlight_segments` |
| `app/services/index_store.py` | `IndexStore` — in-memory cache, disk persistence, TTL cleanup |
| `app/services/uploads.py` | Streaming upload with UTF-8 validation and size limit |

### Frontend module layout

| File | Responsibility |
|------|---------------|
| `src/api/client.ts` | Typed wrappers for all backend API calls |
| `src/components/UploadPanel.tsx` | File upload UI |
| `src/components/Viewer.tsx` | Range/index controls, state wiring |
| `src/components/ContextViewer.tsx` | Renders context lines, highlight segments, ruler |

The target line and ruler share **one horizontal scroll container** to keep column alignment correct. The ruler is a monospace proof line that starts at `index_base` and places tick marks every 5/10 columns.

### App factory pattern

`main.py` exports `create_app(custom_settings)` for testability (tests inject a `Settings` instance pointing at a temp directory) and also exports a module-level `app = create_app()` for `uvicorn`.

## Environment variables (backend)

| Variable | Default |
|----------|---------|
| `TXT_READER_MAX_UPLOAD_MB` | `128` |
| `TXT_READER_MAX_RADIUS` | `200` |
| `TXT_READER_FILE_TTL_SECONDS` | `86400` |
| `TXT_READER_CLEANUP_INTERVAL_SECONDS` | `1800` |
| `TXT_READER_STORAGE_DIR` | `backend/storage` |
| `TXT_READER_UPLOADS_DIR` | `$STORAGE_DIR/uploads` |
| `TXT_READER_INDEXES_DIR` | `$STORAGE_DIR/indexes` |
| `TXT_READER_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |

Frontend: `VITE_API_BASE_URL` defaults to `http://localhost:8000`.
