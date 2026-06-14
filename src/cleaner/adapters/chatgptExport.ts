/**
 * OpenAI ChatGPT "Export data" format (`conversations.json`).
 *
 * A JSON array of conversation objects; each has a `mapping` of
 * node-id -> {message: {author: {role}, content: {content_type, parts}}} forming a
 * tree. We walk nodes in `create_time` order and keep user/assistant text parts.
 */

import { Message, Session, type Options } from "../types";
import { cleanUserText, inferProvider } from "../text";
import { finaliseSessions } from "../merge";
import { asDict, dictRecords, getStr, isPlainObject, type Adapter } from "./base";

/**
 * Format an epoch-seconds value the way CPython's
 * `datetime.fromtimestamp(ct, utc).isoformat().replace("+00:00", "Z")` does:
 * "YYYY-MM-DDTHH:MM:SS[.ffffff]Z", with the fractional part present (6 digits)
 * only when there are non-zero microseconds.
 */
function isoFromEpochSeconds(ct: number): string {
  let sec = Math.floor(ct);
  let micro = Math.round((ct - sec) * 1e6);
  if (micro >= 1_000_000) {
    sec += 1;
    micro -= 1_000_000;
  }
  const d = new Date(sec * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  let s =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (micro > 0) s += "." + pad(micro, 6);
  return s + "Z";
}

export class ChatGPTExportAdapter implements Adapter {
  readonly name = "chatgpt-export";

  detect(sample: unknown[]): number {
    const recs = dictRecords(sample);
    if (recs.length === 0) return 0.0;
    let hits = 0;
    for (const r of recs) {
      if (
        isPlainObject(r["mapping"]) &&
        ("title" in r || "create_time" in r || "conversation_id" in r)
      ) {
        hits += 1;
      }
    }
    return hits ? Math.min(1.0, hits / recs.length) : 0.0;
  }

  parse(records: unknown[], relPath: string, _opts: Options): Session[] {
    const sessions: Session[] = [];
    for (const raw of records) {
      const convo = asDict(raw);
      if (convo === null) continue;
      const mapping = asDict(convo["mapping"]);
      if (mapping === null) continue;

      const s = new Session({
        session_id: getStr(convo, "conversation_id") || getStr(convo, "id") || null,
        source_file: relPath,
        source_format: this.name,
        project: getStr(convo, "title") ?? null,
      });

      const nodes = Object.values(mapping).filter(
        (n): n is Record<string, unknown> => isPlainObject(n) && !!n["message"],
      );

      const sortKey = (node: Record<string, unknown>): number => {
        const msg = asDict(node["message"]) ?? {};
        const ct = msg["create_time"];
        return typeof ct === "number" ? ct : 0.0;
      };
      nodes.sort((a, b) => sortKey(a) - sortKey(b));

      for (const node of nodes) {
        const msg = asDict(node["message"]) ?? {};
        const author = (asDict(msg["author"]) ?? {})["role"];
        if (author !== "user" && author !== "assistant") continue;
        const content = msg["content"] || {};
        const parts = isPlainObject(content) ? content["parts"] : null;
        let text = "";
        if (Array.isArray(parts)) {
          text = parts.filter((p) => typeof p === "string").join("\n").trim();
        }
        let ts: string | null = null;
        const ct = msg["create_time"];
        if (typeof ct === "number") ts = isoFromEpochSeconds(ct);
        const model = getStr(asDict(msg["metadata"]) ?? {}, "model_slug");
        if (author === "user") {
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
                provider: inferProvider(model) || "openai",
              }),
            );
          }
        }
      }
      if (s.provider === null) s.provider = "openai";
      sessions.push(s);
    }
    return finaliseSessions(sessions);
  }
}
