import type {
  ContextResponse,
  FileMetadata,
  FilteredLinesResponse,
  HighlightResponse,
  IndexBase,
  RangeMode,
  RecordTypesResponse,
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : "Request failed";
    throw new ApiError(response.status, detail);
  }
  return body as T;
}

export async function uploadTxtFile(file: File): Promise<FileMetadata> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/files`, {
    method: "POST",
    body: formData,
  });
  return parseResponse<FileMetadata>(response);
}

export async function fetchContext(
  fileId: string,
  line: number,
  radius: number,
): Promise<ContextResponse> {
  const params = new URLSearchParams({
    line: String(line),
    radius: String(radius),
  });
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/context?${params.toString()}`);
  return parseResponse<ContextResponse>(response);
}

export async function fetchHighlight(
  fileId: string,
  line: number,
  indexBase: IndexBase,
  mode: RangeMode,
  start: number,
  end: number | null,
  length: number | null,
  radius: number,
): Promise<HighlightResponse> {
  const params = new URLSearchParams();
  params.set("line", String(line));
  params.set("index_base", String(indexBase));
  params.set("mode", mode);
  params.set("start", String(start));
  params.set("radius", String(radius));
  if (mode === "end" && end !== null) {
    params.set("end", String(end));
  }
  if (mode === "length" && length !== null) {
    params.set("length", String(length));
  }
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/highlight?${params.toString()}`);
  return parseResponse<HighlightResponse>(response);
}

export async function fetchRecordTypes(fileId: string): Promise<RecordTypesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/record-types`);
  return parseResponse<RecordTypesResponse>(response);
}

export async function fetchFilteredLines(
  fileId: string,
  recordTypes: string[],
): Promise<FilteredLinesResponse> {
  const params = new URLSearchParams();
  for (const rt of recordTypes) {
    params.append("record_type", rt);
  }
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/filter?${params.toString()}`);
  return parseResponse<FilteredLinesResponse>(response);
}

export { ApiError };
