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
}

export interface ContextResponse {
  target_line: number;
  radius: number;
  total_lines: number;
  lines: LineItem[];
}

export interface HighlightSpec {
  start: number;
  end: number;
}

export interface HighlightResponse extends ContextResponse {
  highlight: HighlightSpec;
}

