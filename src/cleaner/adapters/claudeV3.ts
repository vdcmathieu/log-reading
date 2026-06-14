/**
 * Newer Claude Code session log (`"version": 3`).
 *
 * Top-level `type` is session/message/model_change/custom/.... Messages carry
 * `message.content` blocks of type text / thinking / toolCall (camelCase) and a
 * `toolResult` role for tool outputs. The active model is announced by
 * `model_change` lines and echoed on each assistant message.
 */

import { Message, Session, type Options } from "../types";
import { cleanUserText, extractTextBlocks, inferProvider } from "../text";
import { finaliseSessions } from "../merge";
import { asDict, dictRecords, getStr, stem, type Adapter } from "./base";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

export class ClaudeV3Adapter implements Adapter {
  readonly name = "claude-code-v3";

  detect(sample: unknown[]): number {
    const recs = dictRecords(sample);
    if (recs.length === 0) return 0.0;
    let markers = 0;
    for (const r of recs) {
      const type = r["type"];
      if (type === "session" || type === "model_change" || type === "thinking_level_change") {
        markers += 2;
      }
      if (type === "custom" && "customType" in r) markers += 1;
      if ("modelId" in r && "provider" in r) markers += 2;
      if ("responseModel" in r) markers += 1;
      const m = asDict(r["message"]);
      if (m !== null) {
        if (m["role"] === "toolResult") markers += 1;
        const content = m["content"];
        if (Array.isArray(content)) {
          for (const b of content) {
            if (asDict(b) !== null && (b as Record<string, unknown>)["type"] === "toolCall") {
              markers += 1;
              break;
            }
          }
        }
      }
    }
    return Math.min(1.0, markers / (recs.length * 1.5));
  }

  parse(records: unknown[], relPath: string, _opts: Options): Session[] {
    const sess = new Session({
      session_id: null,
      source_file: relPath,
      source_format: this.name,
    });
    const fileStem = stem(relPath);
    let curModel: string | null = null;
    let curProvider: string | null = null;

    for (const raw of records) {
      const rec = asDict(raw);
      if (rec === null) continue;
      const rtype = rec["type"];

      if (rtype === "session") {
        sess.session_id = getStr(rec, "id") || sess.session_id;
        sess.cwd = getStr(rec, "cwd") || sess.cwd;
        if (rec["version"] != null) sess.cli_version = `v${rec["version"]}`;
        sess.noteTime(rec["timestamp"]);
        continue;
      }
      if (rtype === "model_change") {
        curModel = getStr(rec, "modelId") || curModel;
        curProvider = getStr(rec, "provider") || curProvider;
        sess.noteModel(curModel);
        if (curProvider && !sess.provider) sess.provider = curProvider;
        continue;
      }
      if (rtype !== "message") continue; // custom / thinking_level_change / etc.

      const msg = asDict(rec["message"]);
      if (msg === null) continue;
      const role = msg["role"];
      const ts = (rec["timestamp"] as unknown) || (msg["timestamp"] as unknown);

      if (role === "user") {
        const rawText = extractTextBlocks(msg["content"], ["text"]);
        const cleaned = cleanUserText(rawText);
        if (cleaned) sess.addMessage(new Message({ role: "user", text: cleaned, timestamp: ts }));
      } else if (role === "assistant") {
        const model = getStr(msg, "model") || getStr(msg, "responseModel") || curModel;
        const provider = getStr(msg, "provider") || curProvider;
        const text = extractTextBlocks(msg["content"], ["text"]);
        if (text) {
          sess.addMessage(
            new Message({
              role: "assistant",
              text,
              timestamp: ts,
              model,
              provider: provider || inferProvider(model),
            }),
          );
        }
      }
      // role === "toolResult" (or anything else) -> dropped
    }

    if (sess.session_id === null) {
      const m = UUID_RE.exec(fileStem);
      sess.session_id = m ? m[0] : fileStem;
    }
    if (sess.provider === null && sess.models.length) {
      sess.provider = inferProvider(sess.models[0]);
    }
    return finaliseSessions([sess]);
  }
}
