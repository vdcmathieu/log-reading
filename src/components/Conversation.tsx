import { MessageView } from "./MessageView";
import { sessionDateRange, shortModel } from "../lib/format";
import type { CleanSession } from "../cleaner/types";

/** One session rendered as a conversation transcript. */
export function Conversation({ session, index }: { session: CleanSession; index: number }) {
  const metaBits: string[] = [];
  if (session.models?.length) metaBits.push(session.models.map(shortModel).join(", "));
  if (session.provider) metaBits.push(session.provider);
  if (session.project) metaBits.push(session.project);
  const range = sessionDateRange(session.started_at, session.ended_at);
  if (range) metaBits.push(range);

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-8 border-b border-[var(--color-line)] pb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">Session {index + 1}</h2>
          {session.session_id && (
            <code className="rounded bg-[#f2efe9] px-1.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
              {session.session_id}
            </code>
          )}
        </div>
        {metaBits.length > 0 && (
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{metaBits.join(" · ")}</p>
        )}
        {session.cwd && (
          <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted)]" title={session.cwd}>
            {session.cwd}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-7">
        {session.messages.map((msg, i) => (
          <MessageView key={i} msg={msg} />
        ))}
      </div>

      <footer className="mt-10 border-t border-[var(--color-line)] pt-4 text-center text-xs text-[var(--color-muted)]">
        {session.message_count} messages · format: {session.source_format}
      </footer>
    </article>
  );
}
