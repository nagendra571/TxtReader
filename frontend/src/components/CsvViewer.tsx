import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchCsvFilter, fetchCsvStructure } from "../api/client";
import type {
  CsvFilterResponse,
  CsvStructureResponse,
  FileMetadata,
  MatchMode,
} from "../types/api";

interface CsvViewerProps {
  file: FileMetadata;
}

function exportCsv(headers: string[], rows: CsvFilterResponse["rows"], filename: string): void {
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
  const [structure, setStructure] = useState<CsvStructureResponse | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [columnIndex, setColumnIndex] = useState(0);
  const [value, setValue] = useState("");
  const [matchMode, setMatchMode] = useState<MatchMode>("contains");
  const [result, setResult] = useState<CsvFilterResponse | null>(null);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [error, setError] = useState("");

  const loadStructure = useCallback(async () => {
    setLoadingStructure(true);
    setError("");
    try {
      const s = await fetchCsvStructure(file.file_id);
      setStructure(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to read CSV structure.");
    } finally {
      setLoadingStructure(false);
    }
  }, [file.file_id]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

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
      <div className="csv-controls card">
        {/* Structure summary */}
        <section className="control-section">
          <h2>CSV Structure</h2>
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
                {headers.length === 0 && <p className="muted">No headers detected.</p>}
              </div>
            </>
          ) : (
            <p className="muted">Could not read structure.</p>
          )}
        </section>

        {/* Filter controls */}
        <section className="control-section">
          <h2>Filter</h2>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyFilter();
              }}
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

      {/* Results table */}
      <section className="csv-results card">
        <header className="viewer-topbar">
          <div className="viewer-title-wrap">
            <h2>Results</h2>
            {result ? (
              <p className="helper-text">
                {result.total_matches.toLocaleString()} row
                {result.total_matches !== 1 ? "s" : ""} where{" "}
                <strong>{result.column_name}</strong>{" "}
                {result.match_mode === "exact"
                  ? "equals"
                  : result.match_mode === "contains"
                    ? "contains"
                    : "starts with"}{" "}
                &ldquo;{result.value}&rdquo;
              </p>
            ) : (
              <p className="helper-text muted">Select a column, enter a value, and filter.</p>
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
                      className={`csv-th ${i === result.column_index ? "csv-th--active" : ""}`}
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
                        className={`csv-td ${i === result.column_index ? "csv-td--active" : ""}`}
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
