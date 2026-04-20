import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchFilteredLines, fetchRecordTypes } from "../api/client";
import type { FileMetadata, FilteredLinesResponse, LineItem } from "../types/api";

interface RecordTypeFilterProps {
  file: FileMetadata;
}

function exportLines(lines: LineItem[], filename: string): void {
  const content = lines.map((l) => l.text).join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RecordTypeFilter({ file }: RecordTypeFilterProps) {
  const [recordTypes, setRecordTypes] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<FilteredLinesResponse | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [error, setError] = useState("");

  const loadRecordTypes = useCallback(async () => {
    setLoadingTypes(true);
    setError("");
    try {
      const response = await fetchRecordTypes(file.file_id);
      setRecordTypes(response.record_types);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load record types.");
    } finally {
      setLoadingTypes(false);
    }
  }, [file.file_id]);

  useEffect(() => {
    void loadRecordTypes();
  }, [loadRecordTypes]);

  function toggleType(rt: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) {
        next.delete(rt);
      } else {
        next.add(rt);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(Object.keys(recordTypes)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function applyFilter() {
    if (selected.size === 0) {
      setError("Select at least one record type to filter.");
      return;
    }
    setError("");
    setLoadingFilter(true);
    try {
      const response = await fetchFilteredLines(file.file_id, Array.from(selected).sort());
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to filter lines.");
    } finally {
      setLoadingFilter(false);
    }
  }

  const exportFilename = `filtered_${Array.from(selected).sort().join("-")}.txt`;

  return (
    <div className="record-filter-shell">
      <div className="record-filter-controls card">
        <section className="control-section">
          <h2>Record Types</h2>
          {loadingTypes ? (
            <p className="muted">Scanning file…</p>
          ) : (
            <>
              <div className="record-type-select-all">
                <button className="btn-ghost-icon" type="button" onClick={selectAll}>
                  All
                </button>
                <button className="btn-ghost-icon" type="button" onClick={clearAll}>
                  None
                </button>
              </div>
              <div className="record-type-list">
                {Object.entries(recordTypes).map(([rt, count]) => (
                  <label key={rt} className="toggle-field record-type-item">
                    <input
                      type="checkbox"
                      checked={selected.has(rt)}
                      onChange={() => toggleType(rt)}
                    />
                    <span className="record-type-badge">{rt || "(empty)"}</span>
                    <span className="muted record-type-count">{count.toLocaleString()} lines</span>
                  </label>
                ))}
                {Object.keys(recordTypes).length === 0 && (
                  <p className="muted">No record types found.</p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="control-section">
          <h2>Actions</h2>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void applyFilter()}
            disabled={loadingFilter || selected.size === 0}
          >
            {loadingFilter ? "Filtering…" : "Apply Filter"}
          </button>
          {result && (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => exportLines(result.lines, exportFilename)}
              disabled={result.total_matches === 0}
            >
              Export ({result.total_matches.toLocaleString()} lines)
            </button>
          )}
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
        </section>
      </div>

      <section className="record-filter-results card">
        <header className="viewer-topbar">
          <div className="viewer-title-wrap">
            <h2>Filtered Lines</h2>
            {result ? (
              <p className="helper-text">
                {result.total_matches.toLocaleString()} match
                {result.total_matches !== 1 ? "es" : ""} for record type
                {result.record_types.length !== 1 ? "s" : ""}{" "}
                {result.record_types.map((rt) => `"${rt}"`).join(", ")}
              </p>
            ) : (
              <p className="helper-text muted">Select record types and click Apply Filter.</p>
            )}
          </div>
        </header>

        {result && result.lines.length > 0 ? (
          <div className="viewer-shell">
            {result.lines.map((line) => (
              <div className="line-row" key={line.line_no}>
                <div className="line-number">{line.line_no}</div>
                <div className="line-text">
                  <pre className="line-content">{line.text}</pre>
                </div>
              </div>
            ))}
          </div>
        ) : result ? (
          <div className="line-row">
            <div className="line-number">-</div>
            <div className="line-text">
              <p className="muted">No lines matched the selected record types.</p>
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
