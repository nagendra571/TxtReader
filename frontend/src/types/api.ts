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

export interface RecordTypesResponse {
  file_id: string;
  record_types: Record<string, number>;
}

export interface FilteredLinesResponse {
  file_id: string;
  record_types: string[];
  total_matches: number;
  lines: LineItem[];
}

export type MatchMode = "exact" | "contains" | "starts_with";

export interface CsvStructureResponse {
  file_id: string;
  delimiter: string;
  headers: string[];
  total_data_rows: number;
}

export interface CsvRowItem {
  line_no: number;
  values: string[];
}

export interface CsvFilterResponse {
  file_id: string;
  column_index: number;
  column_name: string;
  value: string;
  match_mode: MatchMode;
  total_matches: number;
  rows: CsvRowItem[];
}
