import type { ContextResponse, FileMetadata, HighlightResponse } from "../types/api";

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
  start: number,
  end: number,
  radius: number,
): Promise<HighlightResponse> {
  const params = new URLSearchParams({
    line: String(line),
    start: String(start),
    end: String(end),
    radius: String(radius),
  });
  const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/highlight?${params.toString()}`);
  return parseResponse<HighlightResponse>(response);
}

export { ApiError };

