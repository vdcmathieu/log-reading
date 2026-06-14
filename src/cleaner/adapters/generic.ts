/**
 * Last-resort adapter for formats nobody has written a handler for yet.
 *
 * Looks for a role and any text-bearing field on each record. Always returns a
 * tiny non-zero confidence so a purpose-built adapter wins, but an unknown future
 * format still yields a readable transcript.
 */

import { Message, Session, type Options } from "../types";
import { cleanUserText, extractTextBlocks, inferProvider } from "../text";
import { finaliseSessions } from "../merge";
import { asDict, getStr, isPlainObject, stem, type Adapter } from "./base";

const USER = new Set(["user", "human", "prompt"]);
const ASSISTANT = new Set(["assistant", "model", "ai", "bot", "agent"]);
const TEXT_KEYS = ["content", "text", "message", "parts"] as const;

function roleOf(rec: Record<string, unknown>): string | null {
  const msg = asDict(rec["message"]);
  const payload = asDict(rec["payload"]);
  const author = asDict(rec["author"]);
  const candidates: unknown[] = [
    rec["role"],
    msg ? msg["role"] : null,
    payload ? payload["role"] : null,
    author ? author["role"] : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string") return c;
  }
  return null;
}

function textOf(rec: Record<string, unknown>): string {
  const containers = [rec, asDict(rec["message"]), asDict(rec["payload"])];
  for (const container of containers) {
    if (container === null || !isPlainObject(container)) continue;
    for (const key of TEXT_KEYS) {
      const val = container[key];
      const txt = extractTextBlocks(val, ["text", "input_text", "output_text"]);
      if (txt) return txt;
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  }
  return "";
}

export class GenericAdapter implements Adapter {
  readonly name = "generic";

  detect(sample: unknown[]): number {
    for (const r of sample) {
      const rec = asDict(r);
      if (rec !== null && roleOf(rec) && textOf(rec)) return 0.1;
    }
    return 0.05;
  }

  parse(records: unknown[], relPath: string, _opts: Options): Session[] {
    const s = new Session({
      session_id: stem(relPath),
      source_file: relPath,
      source_format: this.name,
    });
    for (const raw of records) {
      const rec = asDict(raw);
      if (rec === null) continue;
      const role = roleOf(rec);
      if (role === null) continue;
      const roleL = role.toLowerCase();
      let norm: "user" | "assistant";
      if (USER.has(roleL)) norm = "user";
      else if (ASSISTANT.has(roleL)) norm = "assistant";
      else continue;

      const text = textOf(rec);
      const msg = asDict(rec["message"]);
      const ts = msg !== null ? (rec["timestamp"] as unknown) || (msg["timestamp"] as unknown) : rec["timestamp"];
      let model: string | undefined;
      if (msg !== null) model = getStr(msg, "model");
      model = model || getStr(rec, "model");

      if (norm === "user") {
        const cleaned = cleanUserText(text);
        if (cleaned) s.addMessage(new Message({ role: "user", text: cleaned, timestamp: ts }));
      } else {
        if (text) {
          s.addMessage(
            new Message({
              role: "assistant",
              text,
              timestamp: ts,
              model,
              provider: inferProvider(model),
            }),
          );
        }
      }
    }
    return finaliseSessions([s]);
  }
}
