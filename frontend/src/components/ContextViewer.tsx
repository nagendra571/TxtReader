import type { HighlightResponse, LineItem } from "../types/api";

interface ContextViewerProps {
  data: HighlightResponse | null;
  showSpacesAsDots: boolean;
  showFullLine: boolean;
  windowPadding?: number;
}

interface DisplayTargetData {
  pre: string;
  mid: string;
  post: string;
  markerLine: string;
  markerLabels: string;
  windowStart0: number;
  windowEnd0: number;
  rulerTicks: string;
  rulerLabels: string;
}

function visualizeSpaces(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  return text.replace(/ /g, ".");
}

function createAlignmentTemplate(text: string): string[] {
  return Array.from(text, (char) => (char === "\t" ? "\t" : " "));
}

function writeLabel(target: string[], at: number, label: string): void {
  for (let i = 0; i < label.length; i += 1) {
    const idx = at + i;
    if (idx < 0 || idx >= target.length) {
      break;
    }
    if (target[idx] === "\t") {
      continue;
    }
    target[idx] = label[i];
  }
}

function buildRuler(windowText: string, start0Offset: number, indexBase: 0 | 1): {
  ticks: string;
  labels: string;
} {
  const length = windowText.length;
  const tickChars = createAlignmentTemplate(windowText);
  const labelChars = createAlignmentTemplate(windowText);

  for (let i = 0; i < length; i += 1) {
    if (tickChars[i] === "\t") {
      continue;
    }
    const global0 = start0Offset + i;
    if (global0 % 10 === 0) {
      tickChars[i] = "+";
    } else if (global0 % 5 === 0) {
      tickChars[i] = "|";
    }
  }

  for (let i = 0; i < length; i += 1) {
    if (labelChars[i] === "\t") {
      continue;
    }
    const global0 = start0Offset + i;
    if (global0 % 10 !== 0) {
      continue;
    }
    const label = String(global0 + indexBase);
    writeLabel(labelChars, i, label);
  }

  return {
    ticks: tickChars.join(""),
    labels: labelChars.join(""),
  };
}

function buildRangeMarkers(
  windowText: string,
  inWindowStart: number,
  inWindowEnd: number,
  windowStart0: number,
  indexBase: 0 | 1,
): { line: string; labels: string } {
  const markerChars = createAlignmentTemplate(windowText);
  const labelChars = createAlignmentTemplate(windowText);
  const length = windowText.length;

  const startIndex = Math.max(0, Math.min(inWindowStart, Math.max(0, length - 1)));
  const rawEndIndex = Math.max(0, inWindowEnd);
  const endIndex = rawEndIndex >= length ? Math.max(0, length - 1) : rawEndIndex;

  if (length > 0) {
    if (markerChars[startIndex] !== "\t") {
      markerChars[startIndex] = "|";
    }
    if (markerChars[endIndex] !== "\t") {
      markerChars[endIndex] = "|";
    }
  }

  const startLabel = String(windowStart0 + inWindowStart + indexBase);
  const endLabel = String(windowStart0 + inWindowEnd + indexBase);
  writeLabel(labelChars, startIndex, startLabel);

  const endLabelStart = Math.max(
    0,
    Math.min(length - endLabel.length, Math.max(startIndex + startLabel.length + 1, endIndex)),
  );
  writeLabel(labelChars, endLabelStart, endLabel);

  return {
    line: markerChars.join(""),
    labels: labelChars.join(""),
  };
}

function buildTargetDisplayData(
  data: HighlightResponse,
  targetLine: LineItem,
  showFullLine: boolean,
  windowPadding: number,
): DisplayTargetData | null {
  if (!targetLine.segments) {
    return null;
  }

  const fullText = targetLine.text;
  const lineLength = fullText.length;
  const start0 = data.normalized.start0;
  const end0 = data.normalized.end0_exclusive;

  let windowStart0 = 0;
  let windowEnd0 = lineLength;
  if (!showFullLine) {
    windowStart0 = Math.max(0, start0 - windowPadding);
    windowEnd0 = Math.min(lineLength, end0 + windowPadding);
  }

  const windowText = fullText.slice(windowStart0, windowEnd0);
  const inWindowStart = Math.max(start0, windowStart0) - windowStart0;
  const inWindowEnd = Math.max(inWindowStart, Math.min(end0, windowEnd0) - windowStart0);

  const pre = windowText.slice(0, inWindowStart);
  const mid = windowText.slice(inWindowStart, inWindowEnd);
  const post = windowText.slice(inWindowEnd);
  const ruler = buildRuler(windowText, windowStart0, data.index_base);
  const markers = buildRangeMarkers(
    windowText,
    inWindowStart,
    inWindowEnd,
    windowStart0,
    data.index_base,
  );

  return {
    pre,
    mid,
    post,
    markerLine: markers.line,
    markerLabels: markers.labels,
    windowStart0,
    windowEnd0,
    rulerTicks: ruler.ticks,
    rulerLabels: ruler.labels,
  };
}

function renderPlainLine(text: string, showSpacesAsDots: boolean) {
  return <pre className="line-content">{visualizeSpaces(text, showSpacesAsDots)}</pre>;
}

export function ContextViewer({
  data,
  showSpacesAsDots,
  showFullLine,
  windowPadding = 80,
}: ContextViewerProps) {
  if (!data) {
    return (
      <div className="viewer-shell">
        <div className="line-row">
          <div className="line-number">-</div>
          <div className="line-text">
            <p className="muted">Run a highlight query to view context lines.</p>
          </div>
        </div>
      </div>
    );
  }

  const targetLine = data.lines.find((line) => line.line_no === data.target_line);
  const targetDisplay = targetLine
    ? buildTargetDisplayData(data, targetLine, showFullLine, windowPadding)
    : null;

  return (
    <div className="viewer-shell">
      {data.lines.map((line) => {
        const isTarget = line.line_no === data.target_line;
        if (!isTarget || !targetDisplay) {
          return (
            <div className={`line-row ${isTarget ? "target-row" : ""}`} key={line.line_no}>
              <div className="line-number">{line.line_no}</div>
              <div className="line-text">{renderPlainLine(line.text, showSpacesAsDots)}</div>
            </div>
          );
        }

        return (
          <div className="line-row target-row" key={line.line_no}>
            <div className="line-number">{line.line_no}</div>
            <div className="line-text target-line-cell">
              <div className="line-target-scroll">
                <pre className="line-content">
                  <span>{visualizeSpaces(targetDisplay.pre, showSpacesAsDots)}</span>
                  <mark>{visualizeSpaces(targetDisplay.mid, showSpacesAsDots)}</mark>
                  <span>{visualizeSpaces(targetDisplay.post, showSpacesAsDots)}</span>
                </pre>
                <pre className="range-marker-line">{targetDisplay.markerLine}</pre>
                <pre className="range-marker-labels">{targetDisplay.markerLabels}</pre>
                <pre className="line-ruler">{targetDisplay.rulerTicks}</pre>
                <pre className="line-ruler-labels">{targetDisplay.rulerLabels}</pre>
              </div>
              {!showFullLine ? (
                <p className="window-meta">
                  Window: [{targetDisplay.windowStart0 + data.index_base},{" "}
                  {targetDisplay.windowEnd0 + data.index_base})
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
