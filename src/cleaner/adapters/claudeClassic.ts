/**
 * Claude Code "classic" project logs (`~/.claude/projects/<proj>/<session>.jsonl`).
 *
 * One line per event; conversational lines have `type` user/assistant/system and
 * a `message` dict with `role` + `content`. Files may concatenate many sessions
 * (keyed by `sessionId`).
 */

import { Message, Session, type Options } from "../types";
import { cleanUserText, extractTextBlocks, inferProvider } from "../text";
import { finaliseSessions } from "../merge";
import { asDict, dictRecords, getStr, type Adapter } from "./base";

export class ClaudeClassicAdapter implements Adapter {
  readonly name = "claude-code-classic";

  detect(sample: unknown[]): number {
    const recs = dictRecords(sample);
    if (recs.length === 0) return 0.0;
    let hits = 0;
    for (const r of recs) {
      let score = 0;
      if ("parentUuid" in r) score += 1;
      if ("isSidechain" in r) score += 1;
      if ("gitBranch" in r || "userType" in r) score += 1;
      const type = r["type"];
      if (type === "user" || type === "assistant" || type === "system") score += 1;
      // v3 markers should NOT be here
      if (type === "session" || type === "model_change" || type === "thinking_level_change") {
        score -= 3;
      }
      if ("modelId" in r || "responseModel" in r) score -= 2;
      if (score >= 2) hits += 1;
    }
    return Math.min(1.0, (hits / recs.length) * 1.2);
  }

  parse(records: unknown[], relPath: string, opts: Options): Session[] {
    const sessions = new Map<string, Session>();
    const order: string[] = [];

    const getSession = (rec: Record<string, unknown>): Session => {
      const sid = getStr(rec, "_session_id") || getStr(rec, "sessionId") || "default";
      let sess = sessions.get(sid);
      if (sess === undefined) {
        sess = new Session({
          session_id: sid === "default" ? null : sid,
          source_file: relPath,
          source_format: this.name,
        });
        sessions.set(sid, sess);
        order.push(sid);
      }
      // Opportunistically fill metadata from any line that carries it.
      if (!sess.cwd && getStr(rec, "cwd")) sess.cwd = getStr(rec, "cwd")!;
      if (!sess.git_branch && getStr(rec, "gitBranch")) sess.git_branch = getStr(rec, "gitBranch")!;
      if (!sess.cli_version && rec["version"] != null) sess.cli_version = String(rec["version"]);
      if (!sess.project) {
        const proj = getStr(rec, "_project");
        if (proj) sess.project = proj;
        else if (getStr(rec, "cwd")) sess.project = getStr(rec, "cwd")!;
      }
      return sess;
    };

    for (const raw of records) {
      const rec = asDict(raw);
      if (rec === null) continue;
      const msg = asDict(rec["message"]);
      const isMsg = msg !== null && (msg["role"] === "user" || msg["role"] === "assistant");
      if (!isMsg) continue;
      if (rec["isSidechain"] && !opts.includeSidechains) continue;
      if (rec["isMeta"] || rec["isCompactSummary"]) continue;

      const sess = getSession(rec);
      const ts = (rec["timestamp"] as unknown) || (msg!["timestamp"] as unknown);
      const role = msg!["role"];

      if (role === "user") {
        const rawText = extractTextBlocks(msg!["content"], ["text"]);
        const cleaned = cleanUserText(rawText);
        if (cleaned) sess.addMessage(new Message({ role: "user", text: cleaned, timestamp: ts }));
      } else {
        const model = getStr(msg!, "model");
        if (model === "<synthetic>") continue; // injected CLI/error messages
        const text = extractTextBlocks(msg!["content"], ["text"]);
        if (text) {
          sess.addMessage(
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

    for (const sess of sessions.values()) {
      if (sess.provider === null && sess.models.length) {
        sess.provider = inferProvider(sess.models[0]);
      }
    }
    return finaliseSessions(order.map((sid) => sessions.get(sid)!));
  }
}
