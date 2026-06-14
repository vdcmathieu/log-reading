import { sessionDateRange, shortModel } from "../lib/format";
import { downloadJson, downloadMarkdown } from "../lib/download";
import type { ParticipantDoc } from "../cleaner/types";

interface SidebarProps {
  docs: ParticipantDoc[];
  selectedParticipant: string | null;
  selectedSession: number;
  onSelectParticipant: (id: string) => void;
  onSelectSession: (id: string, sessionIndex: number) => void;
}

export function Sidebar({
  docs,
  selectedParticipant,
  selectedSession,
  onSelectParticipant,
  onSelectSession,
}: SidebarProps) {
  return (
    <nav className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {docs.length} source{docs.length === 1 ? "" : "s"}
      </div>
      <ul className="flex flex-col gap-0.5 pb-4">
        {docs.map((doc) => {
          const expanded = doc.participant === selectedParticipant;
          return (
            <li key={doc.participant}>
              <button
                onClick={() => onSelectParticipant(doc.participant)}
                aria-current={expanded ? "true" : undefined}
                aria-expanded={expanded}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--color-canvas)] ${
                  expanded ? "bg-[var(--color-canvas)]" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{doc.participant}</span>
                  <span className="block text-xs text-[var(--color-muted)]">
                    {doc.stats.sessions} sessions · {doc.stats.user_messages} prompts
                  </span>
                </span>
                {doc.stats.parse_errors > 0 && (
                  <span
                    className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                    title={`${doc.stats.parse_errors} parse error(s)`}
                  >
                    <span aria-hidden="true">!</span>
                    <span className="sr-only">{doc.stats.parse_errors} parse errors</span>
                  </span>
                )}
              </button>

              {expanded && (
                <div className="border-y border-[var(--color-line)] bg-[var(--color-canvas)]/60">
                  <div className="flex gap-3 px-4 py-2 text-xs">
                    <button
                      onClick={() => downloadJson(doc)}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      ↓ JSON
                    </button>
                    <button
                      onClick={() => downloadMarkdown(doc)}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      ↓ Markdown
                    </button>
                  </div>
                  <ul>
                    {doc.sessions.map((s, i) => {
                      const active = expanded && selectedSession === i;
                      return (
                        <li key={i}>
                          <button
                            onClick={() => onSelectSession(doc.participant, i)}
                            aria-current={active ? "true" : undefined}
                            className={`flex w-full flex-col gap-0.5 border-l-2 px-4 py-2 pl-5 text-left text-sm transition-colors ${
                              active
                                ? "border-[var(--color-accent)] bg-[var(--color-panel)] font-medium"
                                : "border-transparent hover:bg-[var(--color-panel)]"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span>Session {i + 1}</span>
                              <span className="text-xs font-normal text-[var(--color-muted)]">
                                {s.message_count} msgs
                              </span>
                            </span>
                            <span className="truncate text-xs font-normal text-[var(--color-muted)]">
                              {sessionDateRange(s.started_at, s.ended_at) ||
                                shortModel(s.models?.[0]) ||
                                s.source_format}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
