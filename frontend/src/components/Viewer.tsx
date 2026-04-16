import { FormEvent, useMemo, useState } from "react";
import { ApiError, fetchHighlight } from "../api/client";
import type { FileMetadata, HighlightResponse, IndexBase, RangeMode } from "../types/api";
import { ContextViewer } from "./ContextViewer";

const MAX_RADIUS = 200;

interface ViewerProps {
  file: FileMetadata;
}

interface QueryInputs {
  line: number;
  indexBase: IndexBase;
  mode: RangeMode;
  start: number;
  end: number | null;
  length: number | null;
  radius: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function Viewer({ file }: ViewerProps) {
  const [line, setLine] = useState("1");
  const [indexBase, setIndexBase] = useState<IndexBase>(0);
  const [mode, setMode] = useState<RangeMode>("end");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("0");
  const [length, setLength] = useState("0");
  const [radius, setRadius] = useState("10");
  const [showSpacesAsDots, setShowSpacesAsDots] = useState(false);
  const [showFullLine, setShowFullLine] = useState(true);
  const [queryWord, setQueryWord] = useState("");
  const [data, setData] = useState<HighlightResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const targetLine = useMemo(
    () => data?.lines.find((lineItem) => lineItem.line_no === data.target_line) ?? null,
    [data],
  );

  const computedEndInLengthMode = useMemo(() => {
    const startValue = parseInteger(start);
    const lengthValue = parseInteger(length);
    if (startValue === null || lengthValue === null || lengthValue <= 0) {
      return null;
    }
    return startValue + lengthValue - 1;
  }, [start, length]);

  function buildQueryInputs(overrides?: Partial<QueryInputs>): QueryInputs | null {
    const lineValue = overrides?.line ?? parseInteger(line);
    const startValue = overrides?.start ?? parseInteger(start);
    const endValue = overrides?.end ?? parseInteger(end);
    const lengthValue = overrides?.length ?? parseInteger(length);
    const radiusValue = overrides?.radius ?? parseInteger(radius);
    const activeMode = overrides?.mode ?? mode;
    const activeBase = overrides?.indexBase ?? indexBase;

    if (lineValue === null || lineValue < 1 || lineValue > file.total_lines) {
      setError(`line must be between 1 and ${file.total_lines}`);
      return null;
    }

    const minUserIndex = activeBase === 0 ? 0 : 1;
    if (startValue === null || startValue < minUserIndex) {
      setError(`start must be >= ${minUserIndex} for ${activeBase}-based indexing`);
      return null;
    }

    if (radiusValue === null || radiusValue < 0 || radiusValue > MAX_RADIUS) {
      setError(`radius must be between 0 and ${MAX_RADIUS}`);
      return null;
    }

    if (activeMode === "end") {
      if (endValue === null || endValue < minUserIndex || endValue < startValue) {
        setError(
          `end must be an integer >= start and >= ${minUserIndex} for ${activeBase}-based indexing`,
        );
        return null;
      }
      return {
        line: lineValue,
        indexBase: activeBase,
        mode: activeMode,
        start: startValue,
        end: endValue,
        length: null,
        radius: radiusValue,
      };
    }

    if (lengthValue === null || lengthValue < 0) {
      setError("length must be a non-negative integer");
      return null;
    }

    return {
      line: lineValue,
      indexBase: activeBase,
      mode: activeMode,
      start: startValue,
      end: null,
      length: lengthValue,
      radius: radiusValue,
    };
  }

  async function runQuery(overrides?: Partial<QueryInputs>) {
    const query = buildQueryInputs(overrides);
    if (!query) {
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const response = await fetchHighlight(
        file.file_id,
        query.line,
        query.indexBase,
        query.mode,
        query.start,
        query.end,
        query.length,
        query.radius,
      );
      setData(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to fetch highlight data.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuery();
  }

  async function copyHighlightedText() {
    const text = targetLine?.segments?.mid;
    if (!text) {
      setError("No highlighted text to copy.");
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  async function copyTargetLine() {
    if (!targetLine) {
      setError("No target line loaded.");
      return;
    }
    await navigator.clipboard.writeText(targetLine.text);
  }

  async function jump(delta: number) {
    const current = parseInteger(line) ?? 1;
    const nextLine = clamp(current + delta, 1, file.total_lines);
    setLine(String(nextLine));
    await runQuery({ line: nextLine });
  }

  async function findFirstInLine() {
    if (!targetLine) {
      setError("Run a query before searching in the line.");
      return;
    }
    if (!queryWord) {
      setError("Enter a word to search in the target line.");
      return;
    }

    const index0 = targetLine.text.indexOf(queryWord);
    if (index0 === -1) {
      setError(`"${queryWord}" was not found in line ${targetLine.line_no}.`);
      return;
    }

    const startValue = index0 + indexBase;
    const endValue = index0 + queryWord.length - 1 + indexBase;
    setStart(String(startValue));
    if (mode === "end") {
      setEnd(String(endValue));
      await runQuery({
        line: targetLine.line_no,
        start: startValue,
        end: endValue,
      });
      return;
    }

    setLength(String(queryWord.length));
    await runQuery({
      line: targetLine.line_no,
      start: startValue,
      length: queryWord.length,
    });
  }

  return (
    <section className="inspector-shell">
      <header className="file-header card">
        <div className="file-header-main">
          <div className="file-title-row">
            <span aria-hidden="true" className="file-icon">
              📄
            </span>
            <h1 className="file-title">{file.filename}</h1>
          </div>
          <p className="muted">Precision text inspector for indexed highlight and context lookup.</p>
        </div>
        <div className="meta-pills">
          <div className="meta-pill">
            <span className="meta-label">TOTAL LINES:</span>
            <strong>{file.total_lines.toLocaleString()}</strong>
          </div>
          <div className="meta-pill">
            <span className="meta-label">INDEX BASE:</span>
            <strong>1-based</strong>
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <form className="control-panel card" onSubmit={onSubmit}>
          <section className="control-section">
            <h2>Location</h2>
            <label className="field line-field">
              <span>Line # (1-based)</span>
              <div className="line-nav-row">
                <input value={line} onChange={(e) => setLine(e.target.value)} />
                <button
                  className="btn-ghost-icon"
                  type="button"
                  onClick={() => void jump(-1)}
                  disabled={isLoading}
                  aria-label="Previous line"
                >
                  ◀
                </button>
                <button
                  className="btn-ghost-icon"
                  type="button"
                  onClick={() => void jump(1)}
                  disabled={isLoading}
                  aria-label="Next line"
                >
                  ▶
                </button>
              </div>
            </label>
          </section>

          <section className="control-section">
            <h2>Index Settings</h2>
            <fieldset className="segmented-group">
              <legend>Indexing</legend>
              <label className="seg-option">
                <input
                  type="radio"
                  name="index-base"
                  checked={indexBase === 0}
                  onChange={() => setIndexBase(0)}
                />
                <span>0-based</span>
              </label>
              <label className="seg-option">
                <input
                  type="radio"
                  name="index-base"
                  checked={indexBase === 1}
                  onChange={() => setIndexBase(1)}
                />
                <span>1-based</span>
              </label>
            </fieldset>

            <fieldset className="segmented-group">
              <legend>Range mode</legend>
              <label className="seg-option">
                <input
                  type="radio"
                  name="range-mode"
                  checked={mode === "end"}
                  onChange={() => setMode("end")}
                />
                <span>Start + End</span>
              </label>
              <label className="seg-option">
                <input
                  type="radio"
                  name="range-mode"
                  checked={mode === "length"}
                  onChange={() => setMode("length")}
                />
                <span>Start + Length</span>
              </label>
            </fieldset>

            <label className="field">
              <span>Start Index ({indexBase}-based)</span>
              <input value={start} onChange={(e) => setStart(e.target.value)} />
            </label>

            <div className="mode-slot" aria-live="polite">
              {mode === "end" ? (
                <label className="field">
                  <span>End Index (inclusive)</span>
                  <input value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              ) : (
                <label className="field">
                  <span>Length</span>
                  <input value={length} onChange={(e) => setLength(e.target.value)} />
                </label>
              )}
            </div>

            {mode === "length" ? (
              <p className="helper-text">
                Computed end ({indexBase}-based inclusive):{" "}
                {computedEndInLengthMode === null ? "n/a" : computedEndInLengthMode}
              </p>
            ) : null}
          </section>

          <section className="control-section">
            <h2>View Options</h2>
            <label className="field">
              <span>Radius</span>
              <input value={radius} onChange={(e) => setRadius(e.target.value)} />
            </label>

            <label className="toggle-field">
              <input
                type="checkbox"
                checked={showSpacesAsDots}
                onChange={(e) => setShowSpacesAsDots(e.target.checked)}
              />
              <span>Show spaces as dots (.)</span>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={showFullLine}
                onChange={(e) => setShowFullLine(e.target.checked)}
              />
              <span>Show full line</span>
            </label>
          </section>

          <section className="control-section">
            <h2>Actions</h2>
            <button className="btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? "Loading..." : "Go / Highlight"}
            </button>
            <p className="helper-text">Press Enter to highlight</p>
            <div className="utility-row">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void copyHighlightedText()}
                disabled={!targetLine}
              >
                Copy highlighted
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void copyTargetLine()}
                disabled={!targetLine}
              >
                Copy line
              </button>
            </div>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
          </section>
        </form>

        <section className="viewer-column card">
          <header className="viewer-topbar">
            <div className="viewer-title-wrap">
              <h2>Context Viewer</h2>
              <p className="helper-text">
                Highlight:{" "}
                {data
                  ? `${data.effective_start} -> ${data.effective_end} (${data.index_base}-based)`
                  : "n/a"}
              </p>
              <p className="helper-text">
                Effective range: {data ? `[${data.effective_start}, ${data.effective_end}]` : "n/a"}{" "}
                <span className="separator-dot">•</span> Canonical:{" "}
                {data
                  ? `[${data.normalized.start0}, ${data.normalized.end0_exclusive})`
                  : "n/a"}
              </p>
            </div>
            <div className="finder-inline">
              <label className="field finder-field">
                <span>Find in target line</span>
                <div className="inline-group">
                  <input
                    value={queryWord}
                    onChange={(event) => setQueryWord(event.target.value)}
                    placeholder="word or phrase"
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => void findFirstInLine()}
                    disabled={!targetLine}
                  >
                    Find
                  </button>
                </div>
              </label>
            </div>
          </header>
          <ContextViewer data={data} showSpacesAsDots={showSpacesAsDots} showFullLine={showFullLine} />
        </section>
      </div>
    </section>
  );
}
