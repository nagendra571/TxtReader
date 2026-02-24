import { useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { Viewer } from "./components/Viewer";
import type { FileMetadata } from "./types/api";

function App() {
  const [file, setFile] = useState<FileMetadata | null>(null);

  return (
    <main className="app-shell">
      {file ? (
        <>
          <div className="top-bar">
            <button className="btn-secondary" type="button" onClick={() => setFile(null)}>
              Upload another file
            </button>
          </div>
          <Viewer file={file} />
        </>
      ) : (
        <UploadPanel onUploaded={setFile} />
      )}
    </main>
  );
}

export default App;
