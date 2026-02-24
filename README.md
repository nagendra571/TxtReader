# TxtReader

TxtReader is a high-performance line inspector for large `.txt` files.

It supports:
- upload UTF-8 text files (including very large line counts)
- jump to a specific line
- highlight a substring on that line using character indices
- render line numbers and a context window around the target line

## Conventions

These are fixed throughout the app and API:
- Line number: `1-based`
- Character indices: `0-based`
- Highlight interval: `[start, end)` where `end` is exclusive

Example:
- `text = "hello world"`
- `start = 6`, `end = 11`
- highlighted text is `"world"`

## Why It Is Fast

- Uploaded files are stored on disk; file content is not loaded into the DOM.
- Backend builds a byte-offset index (`offsets[line_no - 1]`) once per upload.
- API reads only requested lines via `mmap` + offsets.
- Frontend renders only the requested context lines, and uses virtualization for larger contexts.

## Repository Layout

```text
backend/
  app/
    main.py
    config.py
    models.py
    schemas.py
    services/
      uploads.py
      indexing.py
      index_store.py
  tests/
    test_api.py
    test_indexing.py
  requirements.txt

frontend/
  src/
    api/client.ts
    components/
      UploadPanel.tsx
      Viewer.tsx
      ContextViewer.tsx
    __tests__/App.test.tsx
  package.json

scripts/
  generate_sample_txt.py
```

## Prerequisites

- Python `3.11+` (3.12 tested)
- Node.js `18+` (Node 20 recommended)
- npm `9+`

## Start Both Apps

Use two terminals from repo root.

## Terminal 1: Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend URL:
- `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

## Terminal 2: Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL:
- `http://localhost:5173`

## Environment Variables

## Backend

- `TXT_READER_MAX_UPLOAD_MB` (default `128`)
- `TXT_READER_MAX_RADIUS` (default `200`)
- `TXT_READER_FILE_TTL_SECONDS` (default `86400`)
- `TXT_READER_CLEANUP_INTERVAL_SECONDS` (default `1800`)
- `TXT_READER_STORAGE_DIR` (default `backend/storage`)
- `TXT_READER_UPLOADS_DIR` (optional custom uploads path)
- `TXT_READER_INDEXES_DIR` (optional custom indexes path)
- `TXT_READER_CORS_ORIGINS` (comma-separated list; defaults include Vite localhost URLs)

## Frontend

- `VITE_API_BASE_URL` (default `http://localhost:8000`)

## API Endpoints

## `POST /api/files`

Uploads a `.txt` file, validates UTF-8, builds index.

Response:
```json
{
  "file_id": "uuid",
  "filename": "myfile.txt",
  "total_lines": 100000
}
```

## `GET /api/files/{file_id}/context?line=123&radius=10`

Returns context window:
```json
{
  "target_line": 123,
  "radius": 10,
  "total_lines": 100000,
  "lines": [
    { "line_no": 113, "text": "..." },
    { "line_no": 114, "text": "..." }
  ]
}
```

## `GET /api/files/{file_id}/highlight?line=123&start=5&end=15&radius=10`

Returns context + highlight metadata and target segments:
```json
{
  "target_line": 123,
  "radius": 10,
  "total_lines": 100000,
  "highlight": { "start": 5, "end": 15 },
  "lines": [
    { "line_no": 122, "text": "..." },
    {
      "line_no": 123,
      "text": "some line",
      "segments": { "pre": "some ", "mid": "line", "post": "" }
    },
    { "line_no": 124, "text": "..." }
  ]
}
```

## Manual Testing Guide

## 1. Generate a Large Test File

From repo root:

```powershell
python scripts\generate_sample_txt.py --output sample_100k.txt --lines 100000
```

## 2. Upload and Basic Highlight

1. Open `http://localhost:5173`.
2. Upload `sample_100k.txt`.
3. Enter:
   - Line: `50000`
   - Start: `8`
   - End: `15`
   - Radius: `10`
4. Click `Go`.
5. Verify:
   - target line is visible and highlighted
   - 10 lines above + 10 below are shown (or clipped near file edges)
   - line numbers appear correctly

## 3. Edge Cases

1. First line boundary:
   - Line `1`, radius `10`
   - Ensure no negative/invalid line rows appear.
2. Last line boundary:
   - Line `100000`, radius `10`
   - Ensure end-of-file clipping works.
3. Invalid range:
   - Set `start > end` or `end` beyond line length
   - Confirm inline error and no crash.
4. Larger context:
   - Radius `200`
   - Confirm UI remains responsive.
5. Quick actions:
   - `Copy highlighted text`
   - `Copy line`
   - `Prev line` / `Next line`
   - Optional search autofill in target line

## 4. UTF-8 and Newline Behavior

1. Upload a UTF-8 file containing emoji or accented characters.
2. Verify highlighting by character index works on decoded text.
3. Upload files with `LF` and `CRLF` endings.
4. Verify returned line text does not include newline characters.

## Automated Tests

## Backend

```powershell
cd backend
pytest
```

Covers:
- index construction (small + large)
- line retrieval by line number
- highlight segmentation
- UTF-8 behavior
- CRLF/LF handling
- API upload + highlight flow

## Frontend

```powershell
cd frontend
npm test
```

Covers:
- upload flow and highlight rendering integration path

## Build for Production

## Backend

```powershell
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Frontend

```powershell
cd frontend
npm run build
npm run preview
```

## Storage and Cleanup

- Uploads and indexes are stored under `backend/storage/` by default.
- Cleanup job runs periodically and removes files older than `TXT_READER_FILE_TTL_SECONDS`.
- Indexes are persisted, so restart recovery works as long as files still exist.

## Troubleshooting

- `Only .txt files are supported`: rename/export as `.txt`.
- `Uploaded file is not valid UTF-8`: re-save file with UTF-8 encoding.
- `radius must be <= ...`: lower radius or increase backend max radius env var.
- CORS issues in browser:
  - ensure frontend URL is included in `TXT_READER_CORS_ORIGINS`.
- Frontend test error `expect is not defined`:
  - ensure `src/setupTests.ts` imports `@testing-library/jest-dom/vitest`
  - ensure Vitest config sets `test.globals = true`
