/**
 * Normalised intermediate representation — the "clean" shape everything maps to.
 *
 * Faithful TypeScript port of the `Message` / `Session` dataclasses in
 * `clean_logs.py`. Kept as mutable classes (rather than plain interfaces) because
 * the adapters and the merge step build sessions up imperatively and mutate
 * messages in place, exactly like the Python.
 */

import { normTs } from "./text";

/** Serialised message — the JSON shape a cleaned message takes in output. */
export interface CleanMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  model?: string;
  provider?: string;
}

/** Serialised session header + messages. */
export interface CleanSession {
  session_id: string | null;
  source_file: string;
  source_format: string;
  provider?: string;
  models?: string[];
  cwd?: string;
  project?: string;
  git_branch?: string;
  cli_version?: string;
  started_at?: string;
  ended_at?: string;
  message_count: number;
  messages: CleanMessage[];
}

/** One cleaned conversational turn: a human prompt or an assistant answer. */
export class Message {
  role: "user" | "assistant";
  text: string;
  timestamp: string | null;
  model: string | null;
  provider: string | null;

  constructor(args: {
    role: "user" | "assistant";
    text: string;
    timestamp?: unknown;
    model?: string | null;
    provider?: string | null;
  }) {
    this.role = args.role;
    this.text = args.text;
    this.timestamp = normTs(args.timestamp);
    this.model = args.model ?? null;
    this.provider = args.provider ?? null;
  }

  toDict(): CleanMessage {
    const d: CleanMessage = { role: this.role, text: this.text };
    if (this.timestamp) d.timestamp = this.timestamp;
    if (this.role === "assistant") {
      if (this.model) d.model = this.model;
      if (this.provider) d.provider = this.provider;
    }
    return d;
  }
}

/** A single conversation/session, after cleaning. */
export class Session {
  session_id: string | null;
  source_file: string;
  source_format: string;
  provider: string | null = null;
  models: string[] = [];
  cwd: string | null = null;
  project: string | null = null;
  git_branch: string | null = null;
  cli_version: string | null = null;
  started_at: string | null = null;
  ended_at: string | null = null;
  messages: Message[] = [];

  constructor(args: {
    session_id: string | null;
    source_file: string;
    source_format: string;
    provider?: string | null;
    cwd?: string | null;
    project?: string | null;
    cli_version?: string | null;
  }) {
    this.session_id = args.session_id;
    this.source_file = args.source_file;
    this.source_format = args.source_format;
    if (args.provider != null) this.provider = args.provider;
    if (args.cwd != null) this.cwd = args.cwd;
    if (args.project != null) this.project = args.project;
    if (args.cli_version != null) this.cli_version = args.cli_version;
  }

  noteModel(model: string | null | undefined): void {
    if (model && model !== "<synthetic>" && !this.models.includes(model)) {
      this.models.push(model);
    }
  }

  noteTime(ts: unknown): void {
    const t = normTs(ts);
    if (!t) return;
    if (this.started_at === null || t < this.started_at) this.started_at = t;
    if (this.ended_at === null || t > this.ended_at) this.ended_at = t;
  }

  addMessage(msg: Message | null): void {
    if (msg === null || !msg.text) return;
    msg.timestamp = normTs(msg.timestamp);
    this.messages.push(msg);
    this.noteTime(msg.timestamp);
    if (msg.role === "assistant") this.noteModel(msg.model);
  }

  toDict(): CleanSession {
    const header: CleanSession = {
      session_id: this.session_id,
      source_file: this.source_file,
      source_format: this.source_format,
      message_count: 0,
      messages: [],
    };
    if (this.provider) header.provider = this.provider;
    if (this.models.length) header.models = this.models;
    if (this.cwd) header.cwd = this.cwd;
    if (this.project) header.project = this.project;
    if (this.git_branch) header.git_branch = this.git_branch;
    if (this.cli_version) header.cli_version = this.cli_version;
    if (this.started_at) header.started_at = this.started_at;
    if (this.ended_at) header.ended_at = this.ended_at;
    header.message_count = this.messages.length;
    header.messages = this.messages.map((m) => m.toDict());
    return header;
  }
}

/** Cleaning options (mirrors the CLI flags of clean_logs.py). */
export interface Options {
  includeSidechains: boolean;
  mergeTurns: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  includeSidechains: false,
  mergeTurns: true,
};

/** Per-participant cleaned document — the top-level output shape. */
export interface ParticipantDoc {
  participant: string;
  generated_at: string;
  source: { path: string; kind: "file" | "folder"; files: string[] };
  formats_detected: Record<string, string>;
  detection_scores: Record<string, Record<string, number>>;
  providers: string[];
  models: string[];
  stats: {
    sessions: number;
    messages: number;
    user_messages: number;
    assistant_messages: number;
    files_processed: number;
    parse_errors: number;
  };
  parse_errors: string[];
  sessions: CleanSession[];
}
