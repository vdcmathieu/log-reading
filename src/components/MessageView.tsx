import { memo } from "react";
import { Markdown } from "./Markdown";
import { fmtTime, shortModel } from "../lib/format";
import type { CleanMessage } from "../cleaner/types";

/**
 * One conversational turn. User prompts render as plain pre-wrapped text in a
 * subtle bubble (faithful to what the human typed); assistant answers render as
 * Markdown with a model/time label.
 */
export const MessageView = memo(function MessageView({ msg }: { msg: CleanMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[88%] overflow-hidden whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[var(--color-user-bubble)] px-4 py-2.5 text-[0.95rem] leading-relaxed text-[var(--color-ink)]">
          {msg.text}
        </div>
        {msg.timestamp && (
          <span className="px-1 text-xs text-[var(--color-muted)]">{fmtTime(msg.timestamp)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">
          AI
        </span>
        {msg.model && <span className="font-mono">{shortModel(msg.model)}</span>}
        {msg.timestamp && <span className="font-normal">· {fmtTime(msg.timestamp)}</span>}
      </div>
      <div className="pl-7">
        <Markdown>{msg.text}</Markdown>
      </div>
    </div>
  );
});
