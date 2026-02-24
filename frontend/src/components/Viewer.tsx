import { FormEvent, useMemo, useState } from "react";
import { ApiError, fetchHighlight } from "../api/client";
import type { FileMetadata, HighlightResponse } from "../types/api";
import { ContextViewer } from "./ContextViewer";

const MAX_RADIUS = 200;

interface ViewerProps {
  file: FileMetadata;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function Viewer({ file }: ViewerProps) {
  const [line, setLine] = useState("1");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("0");
  const [radius, setRadius] = useState("10");
  const [queryWord, setQueryWord] = useState("");
  const [data, setData] = useState<HighlightResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const targetLine = useMemo(
    () => data?.lines.find((lineItem) => lineItem.line_no === data.target_line) ?? null,
    [data],
  );

  async function runQuery(params?: {
    line: number;
    start: number;
    end: number;
    radius: number;
  }) {
    const lineValue = params?.line ?? Number(line);
    const startValue = params?.start ?? Number(start);
    const endValue = params?.end ?? Number(end);
    const radiusValue = params?.radius ?? Number(radius);

    if (!Number.isInteger(lineValue) || lineValue < 1 || lineValue > file.total_lines) {
      setError(`line must be between 1 and ${file.total_lines}`);
      return;
    }
    if (!Number.isInteger(startValue) || startValue < 0) {
      setError("start must be a non-negative integer");
      return;
    }
    if (!Number.isInteger(endValue) || endValue < 0 || endValue < startValue) {
      setError("end must be a non-negative integer and >= start");
      return;
    }
    if (!Number.isInteger(radiusValue) || radiusValue < 0 || radiusValue > MAX_RADIUS) {
      setError(`radius must be between 0 and ${MAX_RADIUS}`);
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const response = await fetchHighlight(file.file_id, lineValue, startValue, endValue, radiusValue);
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
    const current = Number(line) || 1;
    const nextLine = clamp(current + delta, 1, file.total_lines);
    setLine(String(nextLine));
    await runQuery({ line: nextLine, start: Number(start), end: Number(end), radius: Number(radius) });
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

    const index = targetLine.text.indexOf(queryWord);
    if (index === -1) {
      setError(`"${queryWord}" was not found in line ${targetLine.line_no}.`);
      return;
    }

    const nextStart = index;
    const nextEnd = index + queryWord.length;
    setStart(String(nextStart));
    setEnd(String(nextEnd));
    await runQuery({
      line: targetLine.line_no,
      start: nextStart,
      end: nextEnd,
      radius: Number(radius),
    });
  }

  return (
    <section className="card viewer-card">
      <header className="viewer-header">
        <div>
          <h2>{file.filename}</h2>
          <p className="muted">Total lines: {file.total_lines.toLocaleString()}</p>
          <p className="muted">Line is 1-based. Indices are 0-based with end exclusive: [start, end).</p>
        </div>
      </header>

      <form className="controls-grid" onSubmit={onSubmit}>
        <label className="field">
          <span>Line # (1-based)</span>
          <input value={line} onChange={(e) => setLine(e.target.value)} />
        </label>
        <label className="field">
          <span>Start Index (0-based)</span>
          <input value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>End Index (exclusive)</span>
          <input value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="field">
          <span>Radius</span>
          <input value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
        <div className="button-group">
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Loading..." : "Go"}
          </button>
          <button type="button" onClick={() => void jump(-1)} disabled={isLoading}>
            Prev line
          </button>
          <button type="button" onClick={() => void jump(1)} disabled={isLoading}>
            Next line
          </button>
        </div>
      </form>

      <div className="actions-row">
        <button type="button" onClick={() => void copyHighlightedText()} disabled={!targetLine}>
          Copy highlighted text
        </button>
        <button type="button" onClick={() => void copyTargetLine()} disabled={!targetLine}>
          Copy line
        </button>
        <label className="field grow">
          <span>Find first occurrence in target line (optional)</span>
          <div className="inline-group">
            <input
              value={queryWord}
              onChange={(event) => setQueryWord(event.target.value)}
              placeholder="word or phrase"
            />
            <button type="button" onClick={() => void findFirstInLine()} disabled={!targetLine}>
              Find
            </button>
          </div>
        </label>
      </div>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      <ContextViewer data={data} />
    </section>
  );
}

