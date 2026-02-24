import { FormEvent, useState } from "react";
import { uploadTxtFile, ApiError } from "../api/client";
import type { FileMetadata } from "../types/api";

interface UploadPanelProps {
  onUploaded: (metadata: FileMetadata) => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Select a .txt file first.");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const metadata = await uploadTxtFile(selectedFile);
      onUploaded(metadata);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Upload failed.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="card upload-card">
      <h1>TxtReader</h1>
      <p className="muted">
        Upload a UTF-8 <code>.txt</code> file. This app uses indexed random access for fast line lookup.
      </p>

      <form onSubmit={onSubmit}>
        <label className="field">
          <span>Text File</span>
          <input
            aria-label="Text file"
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setError("");
            }}
          />
        </label>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn-primary" type="submit" disabled={isUploading}>
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </form>
    </section>
  );
}
