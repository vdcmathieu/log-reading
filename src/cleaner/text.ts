/**
 * Shared text helpers — faithful port of the module-level helpers in
 * `clean_logs.py` (`_norm_ts`, `infer_provider`, `_extract_text_blocks`,
 * `clean_user_text`) and the boilerplate-stripping patterns.
 */

// Order matters: first matching needle wins (mirrors the Python list order).
const PROVIDER_BY_MODEL: ReadonlyArray<readonly [string, string]> = [
  ["claude", "anthropic"],
  ["gpt", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["o4-mini", "openai"],
  ["codex", "openai"],
  ["gemini", "google"],
  ["grok", "xai"],
  ["kimi", "moonshot"],
  ["moonshot", "moonshot"],
  ["deepseek", "deepseek"],
  ["llama", "meta"],
  ["mistral", "mistralai"],
  ["mixtral", "mistralai"],
  ["qwen", "alibaba"],
  ["command-r", "cohere"],
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalise a timestamp to an ISO-8601 'Z' string.
 *
 * Strings are passed through trimmed (empty -> null). Numbers are treated as
 * epoch seconds, or epoch milliseconds when >= 1e12 (matching the Python). The
 * resulting string always has millisecond precision and a trailing 'Z', exactly
 * like `datetime.fromtimestamp(...).isoformat(timespec="milliseconds")`.
 */
export function normTs(ts: unknown): string | null {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === "string") {
    const s = ts.trim();
    return s || null;
  }
  if (typeof ts === "number") {
    let v = ts;
    if (!Number.isFinite(v)) return null;
    if (v >= 1e12) v /= 1000.0; // milliseconds since epoch -> seconds
    try {
      const d = new Date(v * 1000);
      const ms = d.getTime();
      if (Number.isNaN(ms)) return null;
      return d.toISOString(); // e.g. 2026-06-08T15:52:12.223Z
    } catch {
      return null;
    }
  }
  return null;
}

/** Best-effort provider name from a model id (used when the log omits it). */
export function inferProvider(model: string | null | undefined): string | null {
  if (!model) return null;
  const m = model.toLowerCase();
  for (const [needle, provider] of PROVIDER_BY_MODEL) {
    if (m.includes(needle)) return provider;
  }
  return null;
}

/**
 * Join the text of the wanted block types from a message `content` value.
 *
 * `content` may be a plain string or a list of `{type, text}` blocks. Only
 * blocks whose `type` is in `keepTypes` contribute; everything else (thinking,
 * tool_use, tool_result, images, ...) is ignored. Bare-string list items are
 * kept verbatim, matching the Python.
 */
export function extractTextBlocks(content: unknown, keepTypes: readonly string[]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
        continue;
      }
      if (!isPlainObject(block)) continue;
      const type = block["type"];
      if (typeof type === "string" && keepTypes.includes(type)) {
        const txt = block["text"];
        if (typeof txt === "string" && txt.trim()) parts.push(txt);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

// Patterns for boilerplate injected into "user" turns by the CLIs but never
// typed by the human. `s` = dotall, `g` = replace every occurrence.
const STRIP_BLOCK_PATTERNS: RegExp[] = [
  /<system-reminder>.*?<\/system-reminder>/gs,
  /<local-command-stdout>.*?<\/local-command-stdout>/gs,
  /<local-command-caveat>.*?<\/local-command-caveat>/gs,
  /<task-notification>.*?<\/task-notification>/gs,
];

// Wrappers that mark a whole "user" turn as machine-injected context. If a turn
// is *only* one of these, it is dropped entirely.
const INJECTED_CONTEXT_PREFIXES = [
  "<environment_context>",
  "<permissions instructions>",
  "<skills_instructions>",
  "<user_instructions>",
  "<EXPERIMENTAL_",
  "<command-output>",
  "<task-notification>",
  "[SYSTEM NOTIFICATION",
];

const COMPACT_SUMMARY_PREFIX =
  "This session is being continued from a previous conversation";

const INTERRUPT_RE = /^\[Request interrupted by user[^\]]*\]$/;
const CMD_NAME_RE = /<command-name>(.*?)<\/command-name>/s;
const CMD_ARGS_RE = /<command-args>(.*?)<\/command-args>/s;
const CMD_CONTENTS_RE = /<command-contents>(.*?)<\/command-contents>/s;

/**
 * Turn a raw 'user' turn into the human's actual prompt, or `null` to drop it.
 *
 * Drops: interruption markers, local-command caveats, bare slash commands, and
 * machine-injected context blocks. Keeps: genuine free text, and slash commands
 * that carry argument text (rendered as "<command> <args>").
 */
export function cleanUserText(text: string | null | undefined): string | null {
  if (!text) return null;
  let t = text.trim();
  if (!t) return null;

  if (INTERRUPT_RE.test(t)) return null;

  const low = t.toLowerCase();
  if (low.startsWith("caveat: the messages below") && !t.includes("<command-name>")) {
    return null;
  }

  // CLI-generated context-compaction summary — machine text, not a human prompt.
  if (t.startsWith(COMPACT_SUMMARY_PREFIX)) return null;

  // Slash command invocations: keep only if they carry argument / content text.
  if (t.includes("<command-name>")) {
    const nameM = CMD_NAME_RE.exec(t);
    const argsM = CMD_ARGS_RE.exec(t);
    const contentsM = CMD_CONTENTS_RE.exec(t);
    const name = nameM ? nameM[1].trim() : "";
    let args = argsM ? argsM[1].trim() : "";
    if (!args && contentsM) args = contentsM[1].trim();
    if (!args) return null; // bare utility command like /clear, /model, /init
    const combined = (name + " " + args).trim();
    return combined || null;
  }

  // Whole-turn injected context (Codex environment blocks etc.).
  if (INJECTED_CONTEXT_PREFIXES.some((p) => t.startsWith(p))) return null;

  for (const pat of STRIP_BLOCK_PATTERNS) t = t.replace(pat, "");
  t = t.trim();
  return t || null;
}
