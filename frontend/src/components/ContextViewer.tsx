import { FixedSizeList, ListChildComponentProps } from "react-window";
import type { HighlightResponse, LineItem } from "../types/api";

interface ContextViewerProps {
  data: HighlightResponse | null;
}

interface RowData {
  lines: LineItem[];
  targetLine: number;
}

function renderLineContent(line: LineItem, isTargetLine: boolean) {
  if (isTargetLine && line.segments) {
    return (
      <>
        <span>{line.segments.pre}</span>
        <mark>{line.segments.mid}</mark>
        <span>{line.segments.post}</span>
      </>
    );
  }
  return <span>{line.text}</span>;
}

function VirtualRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const line = data.lines[index];
  const isTarget = line.line_no === data.targetLine;
  return (
    <div className={`line-row ${isTarget ? "target-row" : ""}`} style={style}>
      <div className="line-number">{line.line_no}</div>
      <div className="line-text">{renderLineContent(line, isTarget)}</div>
    </div>
  );
}

export function ContextViewer({ data }: ContextViewerProps) {
  if (!data) {
    return <p className="muted">Run a query to view context lines.</p>;
  }

  const useVirtualized = data.lines.length > 80;
  if (useVirtualized) {
    const rowHeight = 32;
    const height = Math.min(560, data.lines.length * rowHeight);
    return (
      <div className="viewer-shell">
        <FixedSizeList
          height={height}
          width={"100%"}
          itemSize={rowHeight}
          itemCount={data.lines.length}
          itemData={{ lines: data.lines, targetLine: data.target_line }}
        >
          {VirtualRow}
        </FixedSizeList>
      </div>
    );
  }

  return (
    <div className="viewer-shell">
      {data.lines.map((line) => {
        const isTarget = line.line_no === data.target_line;
        return (
          <div className={`line-row ${isTarget ? "target-row" : ""}`} key={line.line_no}>
            <div className="line-number">{line.line_no}</div>
            <div className="line-text">{renderLineContent(line, isTarget)}</div>
          </div>
        );
      })}
    </div>
  );
}
