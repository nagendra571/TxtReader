export interface FileMetadata {
  file_id: string;
  filename: string;
  total_lines: number;
}

export interface LineSegments {
  pre: string;
  mid: string;
  post: string;
}

export interface LineItem {
  line_no: number;
  text: string;
  segments?: LineSegments | null;
  line_length?: number | null;
}

export interface ContextResponse {
  file_id: string;
  target_line: number;
  radius: number;
  total_lines: number;
  lines: LineItem[];
}

export type IndexBase = 0 | 1;
export type RangeMode = "end" | "length";

export interface NormalizedRange {
  start0: number;
  end0_exclusive: number;
}

export interface HighlightResponse extends ContextResponse {
  index_base: IndexBase;
  mode: RangeMode;
  effective_start: number;
  effective_end: number;
  effective_length: number;
  normalized: NormalizedRange;
}
