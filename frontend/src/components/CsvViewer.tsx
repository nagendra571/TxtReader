import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchCsvDistinct,
  fetchCsvFilter,
  fetchCsvStructure,
} from "../api/client";
import type {
  CsvDistinctValue,
  CsvFilterResponse,
  CsvStructureResponse,
  FileMetadata,
  MatchMode,
} from "../types/api";

interface CsvViewerProps {
  file: FileMetadata;
}

function exportCsv(
  headers: string[],
  rows: CsvFilterResponse["rows"],
  filename: string,
): void {
  const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const lines = [
    ["#", ...headers].map(escape).join(","),
    ...rows.map((row) => [String(row.line_no), ...row.values].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const MATCH_MODES: { value: MatchMode; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact" },
  { value: "starts_with", label: "Starts with" },
];

export function CsvViewer({ file }: CsvViewerProps) {
  // ── Structure ──────────────────────────────────────────────────
  const [hasHeader, setHasHeader] = useState(true);
  const [structure, setStructure] = useState<CsvStructureResponse | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);

  // ── Record Type ────────────────────────────────────────────────
  const [rtColumnIndex, setRtColumnIndex] = useState(0);
  const [distinctValues, setDistinctValues] = useState<CsvDistinctValue[]>([]);
  const [loadingDistinct, setLoadingDistinct] = useState(false);
  const [selectedRt, setSelectedRt] = useState<string | null>(null);

  // ── Column Filter ──────────────────────────────────────────────
  const [columnIndex, setColumnIndex] = useState(0);
  const [value, setValue] = useState("");
  const [matchMode, setMatchMode] = useState<MatchMode>("contains");
  const [result, setResult] = useState<CsvFilterResponse | null>(null);
  const [loadingFilter, setLoadingFilter] = useState(false);

  // ── Error ──────────────────────────────────────────────────────
  const [error, setError] = useState("");

  // Fetch structure whenever hasHeader toggles
  const loadStructure = useCallback(async () => {
    setLoadingStructure(true);
    setError("");
    setResult(null);
    setDistinctValues([]);
    setSelectedRt(null);
    try {
      const s = await fetchCsvStructure(file.file_id, hasHeader);
      setStructure(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to read CSV structure.");
    } finally {
      setLoadingStructure(false);
    }
  }, [file.file_id, hasHeader]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  // Fetch distinct values whenever structure or rtColumnIndex changes
  const loadDistinct = useCallback(async () => {
    if (!structure) return;
    setLoadingDistinct(true);
    setSelectedRt(null);
    setResult(null);
    try {
      const d = await fetchCsvDistinct(
        file.file_id,
        rtColumnIndex,
        structure.delimiter,
        hasHeader,
      );
      setDistinctValues(d.values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load distinct values.");
    } finally {
      setLoadingDistinct(false);
    }
  }, [file.file_id, structure, rtColumnIndex, hasHeader]);

  useEffect(() => {
    void loadDistinct();
  }, [loadDistinct]);

  async function applyFilter() {
    if (!structure) return;
    if (!value.trim()) {
      setError("Enter a value to filter by.");
      return;
    }
    setError("");
    setLoadingFilter(true);
    try {
      const r = await fetchCsvFilter(
        file.file_id,
        columnIndex,
        value,
        matchMode,
        structure.delimiter,
        hasHeader,
        selectedRt !== null ? rtColumnIndex : null,
        selectedRt,
      );
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Filter failed.");
    } finally {
      setLoadingFilter(false);
    }
  }

  const headers = structure?.headers ?? [];
  const exportFilename = `filtered_${headers[columnIndex] ?? columnIndex}_${matchMode}.csv`;

  return (
    <div className="csv-viewer-shell">
      {/* ── Left controls panel ─────────────────────────────── */}
      <div className="csv-controls card">

        {/* 1. Has-header toggle */}
        <section className="control-section">
          <h2>CSV Settings</h2>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            <span>First row is a header</span>
          </label>
          {loadingStructure ? (
            <p className="muted">Detecting structure…</p>
          ) : structure ? (
            <>
              <div className="csv-meta-row">
                <span className="helper-text">Delimiter:</span>
                <code className="csv-delimiter-badge">
                  {structure.delimiter === "\t" ? "TAB" : structure.delimiter}
                </code>
                <span className="helper-text">
                  {structure.total_data_rows.toLocaleString()} data rows
                </span>
              </div>
              <div className="csv-header-chips">
                {headers.map((h, i) => (
                  <span key={i} className="csv-header-chip">
                    <span className="csv-header-idx">{i}</span>
                    {h}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {/* 2. Record Type selector */}
        <section className="control-section">
          <h2>Record Type</h2>
          <label className="field">
            <span>Record type column</span>
            <select
              className="csv-select"
              value={rtColumnIndex}
              onChange={(e) => {
                setRtColumnIndex(Number(e.target.value));
              }}
              disabled={!structure}
            >
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {i}: {h}
                </option>
              ))}
            </select>
          </label>

          {loadingDistinct ? (
            <p className="muted">Loading values…</p>
          ) : distinctValues.length > 0 ? (
            <div className="rt-chip-list">
              <button
                className={`rt-chip ${selectedRt === null ? "rt-chip--active" : ""}`}
                type="button"
                onClick={() => { setSelectedRt(null); setResult(null); }}
              >
                All
              </button>
              {distinctValues.map((dv) => (
                <button
                  key={dv.value}
                  className={`rt-chip ${selectedRt === dv.value ? "rt-chip--active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedRt((prev) => (prev === dv.value ? null : dv.value));
                    setResult(null);
                  }}
                  title={`${dv.count.toLocaleString()} rows`}
                >
                  {dv.value || <em>empty</em>}
                  <span className="rt-chip-count">{dv.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : structure ? (
            <p className="muted">No values found in this column.</p>
          ) : null}

          {selectedRt !== null && (
            <p className="helper-text">
              Pre-filtering: <strong>{headers[rtColumnIndex] ?? `Col ${rtColumnIndex}`}</strong>{" "}
              = &ldquo;{selectedRt}&rdquo;
            </p>
          )}
        </section>

        {/* 3. Column filter */}
        <section className="control-section">
          <h2>Column Filter</h2>
          <label className="field">
            <span>Column</span>
            <select
              className="csv-select"
              value={columnIndex}
              onChange={(e) => setColumnIndex(Number(e.target.value))}
              disabled={!structure}
            >
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {i}: {h}
                </option>
              ))}
              {headers.length === 0 && <option value={0}>0</option>}
            </select>
          </label>

          <label className="field">
            <span>Value</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="search value…"
              onKeyDown={(e) => { if (e.key === "Enter") void applyFilter(); }}
            />
          </label>

          <fieldset className="segmented-group">
            <legend>Match mode</legend>
            {MATCH_MODES.map((m) => (
              <label key={m.value} className="seg-option">
                <input
                  type="radio"
                  name="csv-match-mode"
                  checked={matchMode === m.value}
                  onChange={() => setMatchMode(m.value)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </fieldset>

          <button
            className="btn-primary"
            type="button"
            onClick={() => void applyFilter()}
            disabled={loadingFilter || !structure}
          >
            {loadingFilter ? "Filtering…" : "Apply Filter"}
          </button>

          {result && (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => exportCsv(headers, result.rows, exportFilename)}
              disabled={result.total_matches === 0}
            >
              Export ({result.total_matches.toLocaleString()} rows)
            </button>
          )}

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </div>

      {/* ── Right results panel ──────────────────────────────── */}
      <section className="csv-results card">
        <header className="viewer-topbar">
          <div className="viewer-title-wrap">
            <h2>Results</h2>
            {result ? (
              <p className="helper-text">
                {result.total_matches.toLocaleString()} row
                {result.total_matches !== 1 ? "s" : ""}
                {result.record_type_value !== null && (
                  <>
                    {" "}where <strong>{headers[result.record_type_column_index ?? 0] ?? `Col ${result.record_type_column_index}`}</strong>
                    {" "}= &ldquo;{result.record_type_value}&rdquo; and
                  </>
                )}{" "}
                <strong>{result.column_name}</strong>{" "}
                {result.match_mode === "exact"
                  ? "equals"
                  : result.match_mode === "contains"
                    ? "contains"
                    : "starts with"}{" "}
                &ldquo;{result.value}&rdquo;
              </p>
            ) : (
              <p className="helper-text muted">
                {selectedRt !== null
                  ? `Showing record type "${selectedRt}" — enter a value and apply filter.`
                  : "Select a record type and/or enter a value to filter."}
              </p>
            )}
          </div>
        </header>

        {result && result.rows.length > 0 ? (
          <div className="csv-table-wrap">
            <table className="csv-table">
              <thead>
                <tr>
                  <th className="csv-th csv-th--lineno">#</th>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={[
                        "csv-th",
                        i === result.column_index ? "csv-th--active" : "",
                        i === (result.record_type_column_index ?? -1) ? "csv-th--rt" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h || <span className="muted">col {i}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.line_no}>
                    <td className="csv-td csv-td--lineno">{row.line_no}</td>
                    {row.values.map((cell, i) => (
                      <td
                        key={i}
                        className={[
                          "csv-td",
                          i === result.column_index ? "csv-td--active" : "",
                          i === (result.record_type_column_index ?? -1) ? "csv-td--rt" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : result ? (
          <div className="line-row">
            <div className="line-number">-</div>
            <div className="line-text">
              <p className="muted">No rows matched.</p>
            </div>
          </div>
        ) : (
          <div className="line-row">
            <div className="line-number">-</div>
            <div className="line-text">
              <p className="muted">Results will appear here after filtering.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
