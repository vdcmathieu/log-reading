/**
 * OpenAI Codex CLI session log.
 *
 * Records are `{timestamp, type, payload}` where `type` is one of
 * session_meta / turn_context / event_msg / response_item. The cleanest signal is
 * `event_msg` with inner type user_message / agent_message; `response_item`
 * messages are a fallback used only when a session produced no event_msg turns.
 * A single file may hold several sessions, each introduced by `session_meta`.
 */

import { Message, Session, type Options } from "../types";
import { cleanUserText, extractTextBlocks, inferProvider } from "../text";
import { finaliseSessions } from "../merge";
import { asDict, dictRecords, getStr, type Adapter } from "./base";

export class CodexAdapter implements Adapter {
  readonly name = "codex-cli";

  detect(sample: unknown[]): number {
    const recs = dictRecords(sample);
    if (recs.length === 0) return 0.0;
    let hits = 0;
    for (const r of recs) {
      const type = r["type"];
      const isKnown =
        type === "session_meta" ||
        type === "turn_context" ||
        type === "event_msg" ||
        type === "response_item";
      if ("payload" in r && isKnown) {
        hits += 1;
      } else {
        const payload = asDict(r["payload"]);
        if (payload !== null && "model_provider" in payload) hits += 1;
      }
    }
    return Math.min(1.0, (hits / recs.length) * 1.3);
  }

  parse(records: unknown[], relPath: string, _opts: Options): Session[] {
    const sessions: Session[] = [];
    let cur: Session | null = null;
    let curModel: string | null = null;
    let curProvider: string | null = null;
    // Per-session fallback buffers (response_item messages), used only if the
    // session produced no event_msg conversational turns.
    const fallback = new Map<Session, Message[]>();

    const newSession = (payload: Record<string, unknown>, ts: unknown): Session => {
      const s = new Session({
        session_id: getStr(payload, "id") ?? null,
        source_file: relPath,
        source_format: this.name,
        cwd: getStr(payload, "cwd") ?? null,
        provider: getStr(payload, "model_provider") ?? null,
        cli_version: getStr(payload, "cli_version") ?? null,
      });
      s.noteTime(ts);
      curProvider = getStr(payload, "model_provider") ?? null;
      curModel = null;
      sessions.push(s);
      fallback.set(s, []);
      return s;
    };

    for (const raw of records) {
      const rec = asDict(raw);
      if (rec === null) continue;
      const rtype = rec["type"];
      const payload = asDict(rec["payload"]);
      const ts = rec["timestamp"];
      if (payload === null) continue;

      if (rtype === "session_meta") {
        cur = newSession(payload, ts);
        continue;
      }

      if (cur === null) {
        // A stream that starts mid-session: synthesise one.
        cur = new Session({ session_id: null, source_file: relPath, source_format: this.name });
        sessions.push(cur);
        fallback.set(cur, []);
      }

      if (rtype === "turn_context") {
        if (getStr(payload, "model")) {
          curModel = getStr(payload, "model")!;
          cur.noteModel(curModel);
        }
        if (getStr(payload, "cwd") && !cur.cwd) cur.cwd = getStr(payload, "cwd")!;
        continue;
      }

      if (rtype === "event_msg") {
        const ptype = payload["type"];
        if (ptype === "user_message") {
          const cleaned = cleanUserText(payload["message"] as string | null | undefined);
          if (cleaned) cur.addMessage(new Message({ role: "user", text: cleaned, timestamp: ts }));
        } else if (ptype === "agent_message") {
          const raw2 = payload["message"];
          const text = (typeof raw2 === "string" ? raw2 : "").trim();
          if (text) {
            cur.addMessage(
              new Message({
                role: "assistant",
                text,
                timestamp: ts,
                model: curModel,
                provider: curProvider || inferProvider(curModel),
              }),
            );
          }
        }
        continue;
      }

      if (rtype === "response_item" && payload["type"] === "message") {
        const role = payload["role"];
        if (role !== "user" && role !== "assistant") continue;
        const keep = role === "user" ? ["input_text"] : ["output_text", "text"];
        let text = extractTextBlocks(payload["content"], keep);
        if (role === "user") text = cleanUserText(text) || "";
        if (text) {
          fallback.get(cur)!.push(
            new Message({
              role,
              text,
              timestamp: ts,
              model: role === "assistant" ? curModel : null,
              provider: role === "assistant" ? curProvider || inferProvider(curModel) : null,
            }),
          );
        }
      }
    }

    // Apply fallback for sessions with no event-based turns.
    for (const s of sessions) {
      const buf = fallback.get(s);
      if (s.messages.length === 0 && buf && buf.length) {
        for (const m of buf) s.addMessage(m);
      }
      if (s.provider === null && s.models.length) {
        s.provider = inferProvider(s.models[0]);
      }
    }

    return finaliseSessions(sessions);
  }
}
