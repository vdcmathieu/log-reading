import { useEffect, useRef, useState } from "react";

interface DropzoneProps {
  onDataTransfer: (dt: DataTransfer) => void;
  onFileList: (files: FileList) => void;
}

/** Empty-state hero: drag-and-drop area plus file / folder pickers. */
export function Dropzone({ onDataTransfer, onFileList }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` isn't in the React types; set it imperatively.
  useEffect(() => {
    const el = dirInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't let the root drop handler process it again
          setDragging(false);
          onDataTransfer(e.dataTransfer);
        }}
        className={`flex w-full max-w-xl flex-col items-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
          dragging
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
            : "border-[var(--color-line)] bg-[var(--color-panel)]"
        }`}
      >
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 text-2xl">
          📑
        </div>
        <h1 className="text-xl font-semibold">Drop your AI logs to read them</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
          ChatGPT, Claude Code, Codex and others — cleaned into readable conversations right here.
          Everything runs in your browser; <strong>nothing is uploaded.</strong>
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Choose files
          </button>
          <button
            onClick={() => dirInputRef.current?.click()}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-canvas)]"
          >
            Choose a folder
          </button>
        </div>

        <p className="mt-5 max-w-md text-xs text-[var(--color-muted)]">
          Each file or folder you drop is read as one source. Drop several at once to compare.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jsonl,.ndjson,.json,.log"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onFileList(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={dirInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onFileList(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
