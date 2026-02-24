# TxtReader

TxtReader is a developer-focused text inspector for large `.txt` files.

It is built for correctness and speed:
- uploads UTF-8 text files with 100k+ lines
- random-accesses lines using persisted byte-offset indexes
- highlights ranges by user-selected index rules
- renders only context lines (not full file DOM)

## Core Conventions

- Line number is always `1-based`.
- User index base is configurable: `0-based` or `1-based`.
- Backend canonical range is always `0-based` with `end exclusive`.
- User chooses one range mode:
  - `Start + End`
  - `Start + Length`

## Feature Summary

- Upload `.txt` and get `file_id`, filename, total lines.
- Fetch context around target line (`radius`, default 10).
- Highlight target range with:
  - index base toggle (`0` or `1`)
  - range mode toggle (`end` or `length`)
- Show computed effective values and normalized canonical values.
- Target line index ruler under the line:
  - aligned monospace proof line
  - starts numbering from selected index base
  - tick markers every 5/10 columns
- Optional UI toggles:
  - Show spaces as dots (` ` -> `.`) without breaking index mapping (1:1 replacement)
  - Show full line or window around highlight
- Quick actions:
  - Copy highlighted text
  - Copy full target line
  - Prev / Next line
  - Find first occurrence in current target line

## Performance Architecture

## Backend

- FastAPI async API.
- Uploaded files are saved to disk (`backend/storage/uploads`).
- On upload, app builds line-start byte offsets:
  - one offset per line
  - persisted to disk as `{file_id}.idx`
  - cached in memory for fast access
- Reads only needed lines using offsets + `mmap`.
- No full-file string list is created in memory.
- Handles both `LF` and `CRLF`.
- UTF-8 is validated during streaming upload.
- TTL cleanup removes expired files/indexes.

## Frontend

- React + TypeScript + Vite.
- Renders only returned context lines.
- Monospace + `white-space: pre` for visual/index consistency.
- Target line and ruler share one horizontal scroll container for alignment.

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

## Start the Apps

Use two terminals from repository root.

## Terminal 1: Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend URLs:
- API root: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

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

- `TXT_READER_MAX_UPLOAD_MB` default: `128`
- `TXT_READER_MAX_RADIUS` default: `200`
- `TXT_READER_FILE_TTL_SECONDS` default: `86400`
- `TXT_READER_CLEANUP_INTERVAL_SECONDS` default: `1800`
- `TXT_READER_STORAGE_DIR` default: `backend/storage`
- `TXT_READER_UPLOADS_DIR` optional custom uploads path
- `TXT_READER_INDEXES_DIR` optional custom indexes path
- `TXT_READER_CORS_ORIGINS` comma-separated origins

## Frontend

- `VITE_API_BASE_URL` default: `http://localhost:8000`

## API

## `POST /api/files`

Upload a UTF-8 `.txt` file.

Response:
```json
{
  "file_id": "uuid",
  "filename": "sample.txt",
  "total_lines": 100000
}
```

## `GET /api/files/{file_id}/context?line=123&radius=10`

Response:
```json
{
  "file_id": "uuid",
  "target_line": 123,
  "radius": 10,
  "total_lines": 100000,
  "lines": [
    { "line_no": 113, "text": "..." },
    { "line_no": 123, "text": "..." },
    { "line_no": 133, "text": "..." }
  ]
}
```

## `GET /api/files/{file_id}/highlight`

Query params:
- `line` (1-based)
- `index_base` (`0` or `1`)
- `mode` (`end` or `length`)
- `start`
- `end` when `mode=end`
- `length` when `mode=length`
- `radius` (default `10`)

Response:
```json
{
  "file_id": "uuid",
  "target_line": 123,
  "radius": 10,
  "total_lines": 100000,
  "index_base": 1,
  "mode": "length",
  "effective_start": 6,
  "effective_end": 16,
  "effective_length": 10,
  "normalized": {
    "start0": 5,
    "end0_exclusive": 15
  },
  "lines": [
    { "line_no": 122, "text": "..." },
    {
      "line_no": 123,
      "text": "the target line",
      "line_length": 200,
      "segments": { "pre": "...", "mid": "...", "post": "..." }
    },
    { "line_no": 124, "text": "..." }
  ]
}
```

## Manual Testing

## 1. Generate large test data

```powershell
python scripts\generate_sample_txt.py --output sample_100k.txt --lines 100000
```

## 2. Baseline highlight flow

1. Open `http://localhost:5173`.
2. Upload `sample_100k.txt`.
3. Enter:
   - Line `50000`
   - Indexing `0-based`
   - Range mode `Start + End`
   - Start `8`
   - End `20`
   - Radius `10`
4. Click `Go / Highlight`.
5. Verify:
   - target line is highlighted
   - line numbers are shown
   - exactly context rows around target are rendered
   - ruler appears under target line and starts at `0`

## 3. Switch index base

1. Change Indexing to `1-based`.
2. Adjust start/end to equivalent positions.
3. Click `Go / Highlight`.
4. Verify:
   - highlight still matches expected text
   - ruler labels now start at `1`

## 4. Switch to length mode

1. Change Range mode to `Start + Length`.
2. Set Start and Length.
3. Verify:
   - computed end display updates
   - returned effective range matches expected
   - highlight length equals configured length

## 5. Dot-space visualization

1. Enable `Show spaces as dots (.)`.
2. Verify spaces render as `.` on lines.
3. Confirm highlight remains aligned and unchanged by index.

## 6. Windowed target view

1. Disable `Show full line`.
2. Verify:
   - target line and ruler are windowed around highlight
   - horizontal alignment remains correct

## 7. Edge and validation checks

- Line out of range.
- Start/end invalid.
- Negative length.
- Radius > configured max.
- Start > end in end mode.
- UTF-8 files with emoji/accented characters.
- Files with `LF` and `CRLF`.

Expected: clear inline/backend validation errors; app remains stable.

## Automated Tests

## Backend

```powershell
cd backend
pytest
```

Coverage includes:
- offset index builder correctness
- line retrieval correctness
- highlight segmentation
- 0-based and 1-based normalization
- length mode conversion
- UTF-8 and CRLF/LF behavior
- API upload/highlight flow

## Frontend

```powershell
cd frontend
npm test
```

Coverage includes:
- upload -> highlight flow
- base toggle behavior
- length mode behavior
- space-dot visualization alignment
- ruler numbering start proof

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

## Storage and Lifecycle

- Uploads and indexes default to `backend/storage`.
- Indexes persist across restarts.
- Cleanup task periodically removes expired artifacts by TTL.

## Troubleshooting

- `Only .txt files are supported`:
  - upload a file with `.txt` extension.
- `Uploaded file is not valid UTF-8`:
  - re-save source as UTF-8.
- `radius must be <= ...`:
  - lower radius or raise backend max radius env var.
- CORS errors:
  - include frontend origin in `TXT_READER_CORS_ORIGINS`.
- Frontend test error `expect is not defined`:
  - ensure `src/setupTests.ts` imports `@testing-library/jest-dom/vitest`
  - ensure `vite.config.ts` has `test.globals = true`
