import { useCallback, useEffect, useRef, useState } from "react";
import { Dropzone } from "./components/Dropzone";
import { Sidebar } from "./components/Sidebar";
import { Conversation } from "./components/Conversation";
import { useCleaner } from "./lib/useCleaner";
import { gatherFromDataTransfer, gatherFromFileList, groupParticipants } from "./lib/ingest";
import { shortModel } from "./lib/format";
import type { ParticipantDoc } from "./cleaner/types";

export default function App() {
  const { state, clean, reset, reportError } = useCleaner();
  const { docs, status, progress, errors } = state;

  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Auto-select the first participant once results arrive.
  useEffect(() => {
    if (selectedParticipant === null && docs.length > 0) {
      setSelectedParticipant(docs[0].participant);
      setSelectedSession(0);
    }
  }, [docs, selectedParticipant]);

  const handleDataTransfer = useCallback(
    async (dt: DataTransfer) => {
      try {
        const dropped = await gatherFromDataTransfer(dt);
        clean(groupParticipants(dropped));
      } catch (err) {
        reportError("(drop)", `Could not read the dropped items: ${String(err)}`);
      }
    },
    [clean, reportError],
  );

  const handleFileList = useCallback(
    (files: FileList) => {
      clean(groupParticipants(gatherFromFileList(files)));
    },
    [clean],
  );

  const onSelectParticipant = (id: string) => {
    setSelectedParticipant(id);
    setSelectedSession(0);
  };
  const onSelectSession = (id: string, idx: number) => {
    setSelectedParticipant(id);
    setSelectedSession(idx);
  };

  const handleReset = () => {
    reset();
    setSelectedParticipant(null);
    setSelectedSession(0);
  };

  const selectedDoc = docs.find((d) => d.participant === selectedParticipant) ?? null;
  const session =
    selectedDoc && selectedDoc.sessions[selectedSession]
      ? selectedDoc.sessions[selectedSession]
      : (selectedDoc?.sessions[0] ?? null);
  const sessionIndex = selectedDoc?.sessions[selectedSession] ? selectedSession : 0;

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          dragDepth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void handleDataTransfer(e.dataTransfer);
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold">Log Reader</span>
          <span className="hidden text-xs text-[var(--color-muted)] sm:inline">
            Cleaned in your browser · nothing uploaded
          </span>
        </div>
        <div className="flex items-center gap-3">
          {status === "working" && progress && (
            <span role="status" aria-live="polite" className="text-xs text-[var(--color-muted)]">
              Cleaning {progress.done}/{progress.total}…
            </span>
          )}
          {docs.length > 0 && (
            <>
              <button
                onClick={() => addInputRef.current?.click()}
                className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-canvas)]"
              >
                + Add logs
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-canvas)]"
              >
                Clear
              </button>
            </>
          )}
          <input
            ref={addInputRef}
            type="file"
            multiple
            accept=".jsonl,.ndjson,.json,.log"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFileList(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {errors.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800"
        >
          {errors.map((err, i) => (
            <div key={i}>
              <strong>{err.participant}</strong>: {err.message}
            </div>
          ))}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {docs.length === 0 ? (
          status === "working" ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted)]">
              Cleaning {progress?.done ?? 0}/{progress?.total ?? 0}…
            </div>
          ) : (
            <Dropzone onDataTransfer={handleDataTransfer} onFileList={handleFileList} />
          )
        ) : (
          <>
            <Sidebar
              docs={docs}
              selectedParticipant={selectedParticipant}
              selectedSession={selectedSession}
              onSelectParticipant={onSelectParticipant}
              onSelectSession={onSelectSession}
            />
            <main className="min-h-0 flex-1 overflow-y-auto">
              {selectedDoc && <ParticipantBar doc={selectedDoc} />}
              {session ? (
                <Conversation key={`${selectedParticipant}:${sessionIndex}`} session={session} index={sessionIndex} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
                  No readable conversation in this source.
                </div>
              )}
            </main>
          </>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-accent)]/10 backdrop-blur-sm">
            <div className="rounded-2xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-panel)] px-10 py-8 text-center">
              <div className="text-lg font-semibold">Drop to clean &amp; read</div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">Nothing leaves your browser.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantBar({ doc }: { doc: ParticipantDoc }) {
  const bits: string[] = [];
  if (doc.providers.length) bits.push(doc.providers.join(", "));
  if (doc.models.length) bits.push(doc.models.map(shortModel).join(", "));
  const formats = Object.values(doc.formats_detected);
  const uniqueFormats = [...new Set(formats)];
  return (
    <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-panel)]/90 px-6 py-2.5 text-xs text-[var(--color-muted)] backdrop-blur">
      <span className="font-semibold text-[var(--color-ink)]">{doc.participant}</span>
      <span>
        {doc.stats.sessions} sessions · {doc.stats.user_messages} prompts ·{" "}
        {doc.stats.assistant_messages} answers
      </span>
      {uniqueFormats.length > 0 && <span>· {uniqueFormats.join(", ")}</span>}
      {bits.length > 0 && <span>· {bits.join(" · ")}</span>}
    </div>
  );
}
