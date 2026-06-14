/**
 * Participant-level processing — port of `process_participant`, plus the
 * Markdown transcript renderer (`write_markdown`) used for downloads.
 *
 * The Python reads a participant from disk; here a participant is an in-memory
 * bundle of already-read files, so the browser never touches the filesystem.
 */

import { Session, type CleanSession, type Options, type ParticipantDoc } from "./types";
import { iterRecords, objStream, sampleRecords } from "./records";
import { mergeConsecutive } from "./merge";
import { chooseAdapter } from "./adapters";

/** One already-read log file belonging to a participant. */
export interface InputFile {
  /** Path relative to the participant root, e.g. "P093/session.jsonl". */
  relPath: string;
  /** Basename, e.g. "session.jsonl" — used for suffix detection and errors. */
  name: string;
  text: string;
}

/** A participant: a single dropped file, or a folder of files. */
export interface ParticipantInput {
  id: string;
  sourcePath: string;
  kind: "file" | "folder";
  files: InputFile[];
}

function nowIso(): string {
  // Match Python's isoformat(timespec="seconds") + "Z".
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Clean every file for one participant and return the participant document. */
export function processParticipant(input: ParticipantInput, opts: Options): ParticipantDoc {
  const pid = input.id;
  const files = input.files;
  const allSessions: Session[] = [];
  const formats: Record<string, string> = {};
  const detectScores: Record<string, Record<string, number>> = {};
  const parseErrors: string[] = [];

  for (const f of files) {
    const rel = f.relPath;
    let records;
    try {
      records = iterRecords(f.name, f.text);
    } catch (exc) {
      parseErrors.push(`${rel}: unreadable (${exc})`);
      formats[rel] = "error";
      continue;
    }
    const sample = sampleRecords(records);
    if (sample.length === 0) {
      parseErrors.push(`${rel}: no readable JSON records`);
      formats[rel] = "empty";
      continue;
    }
    const { adapter, scores } = chooseAdapter(sample);
    formats[rel] = adapter.name;
    detectScores[rel] = scores;
    try {
      const objs = objStream(records, f.name, parseErrors);
      const sessions = adapter.parse(objs, rel, opts);
      allSessions.push(...sessions);
    } catch (exc) {
      parseErrors.push(`${rel}: adapter ${adapter.name} failed: ${exc}`);
    }
  }

  if (opts.mergeTurns) {
    for (const s of allSessions) s.messages = mergeConsecutive(s.messages);
  }

  allSessions.sort((a, b) => {
    const ka = a.started_at || "";
    const kb = b.started_at || "";
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    if (a.source_file < b.source_file) return -1;
    if (a.source_file > b.source_file) return 1;
    return 0;
  });

  const models: string[] = [];
  const providers: string[] = [];
  let userMsgs = 0;
  let assistantMsgs = 0;
  for (const s of allSessions) {
    for (const m of s.models) if (!models.includes(m)) models.push(m);
    if (s.provider && !providers.includes(s.provider)) providers.push(s.provider);
    for (const msg of s.messages) {
      if (msg.role === "user") userMsgs += 1;
      else assistantMsgs += 1;
    }
  }

  return {
    participant: pid,
    generated_at: nowIso(),
    source: {
      path: input.sourcePath,
      kind: input.kind,
      files: files.map((f) => f.relPath),
    },
    formats_detected: formats,
    detection_scores: detectScores,
    providers,
    models,
    stats: {
      sessions: allSessions.length,
      messages: userMsgs + assistantMsgs,
      user_messages: userMsgs,
      assistant_messages: assistantMsgs,
      files_processed: files.length,
      parse_errors: parseErrors.length,
    },
    parse_errors: parseErrors,
    sessions: allSessions.map((s) => s.toDict()),
  };
}

/** Clean several participants. */
export function cleanParticipants(inputs: ParticipantInput[], opts: Options): ParticipantDoc[] {
  return inputs.map((input) => processParticipant(input, opts));
}

/** A human-readable transcript next to the JSON — port of `write_markdown`. */
export function renderMarkdown(doc: ParticipantDoc): string {
  const lines: string[] = [];
  lines.push(`# Participant ${doc.participant} — clean transcript`);
  lines.push("");
  const st = doc.stats;
  lines.push(
    `*${st.sessions} sessions · ${st.user_messages} user prompts · ` +
      `${st.assistant_messages} assistant answers · models: ${doc.models.join(", ") || "unknown"}*`,
  );
  lines.push("");
  doc.sessions.forEach((sess: CleanSession, idx) => {
    const i = idx + 1;
    lines.push("---");
    lines.push("");
    let head = `## Session ${i}`;
    if (sess.session_id) head += ` · \`${sess.session_id}\``;
    lines.push(head);
    const metaBits: string[] = [];
    if (sess.models) metaBits.push(`model: ${sess.models.join(", ")}`);
    if (sess.provider) metaBits.push(`provider: ${sess.provider}`);
    if (sess.project) metaBits.push(`project: ${sess.project}`);
    if (sess.started_at) metaBits.push(`started: ${sess.started_at}`);
    metaBits.push(`format: ${sess.source_format ?? "?"}`);
    if (metaBits.length) lines.push("_" + metaBits.join(" · ") + "_");
    lines.push("");
    for (const msg of sess.messages) {
      let who = msg.role === "user" ? "🧑 User" : "🤖 Assistant";
      if (msg.role === "assistant" && msg.model) who += ` (${msg.model})`;
      lines.push(`**${who}:**`);
      lines.push("");
      lines.push(msg.text);
      lines.push("");
    }
  });
  return lines.join("\n");
}
