/**
 * Turn-merging and session finalisation — port of `merge_consecutive` and
 * `_finalise_sessions`.
 */

import { Message, Session } from "./types";

/**
 * Collapse runs of consecutive ASSISTANT turns into one answer.
 *
 * Agentic CLIs emit an assistant "turn" for every step between tool calls, so a
 * single answer arrives as many fragments once tool calls are stripped. Merging
 * them restores the natural "one prompt -> one answer" reading. User turns are
 * NEVER merged: two consecutive human turns are two distinct prompts.
 */
export function mergeConsecutive(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === "assistant" && m.role === "assistant") {
      prev.text = (prev.text + "\n\n" + m.text).trim();
      if (!prev.model && m.model) prev.model = m.model;
      if (!prev.provider && m.provider) prev.provider = m.provider;
    } else {
      out.push(m);
    }
  }
  return out;
}

/** Drop empty sessions (sessions with no surviving messages). */
export function finaliseSessions(sessions: Iterable<Session>): Session[] {
  const out: Session[] = [];
  for (const s of sessions) {
    if (s.messages.length === 0) continue;
    out.push(s);
  }
  return out;
}
