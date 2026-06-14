/** Small display helpers for the UI (pure, no side effects). */

/** "Jun 8, 2026, 3:52 PM" — local, human-readable; "" for missing input. */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 8, 2026" — date only. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "3:52 PM" — time only. */
export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Strip region/vendor prefixes from a model id for compact display. */
export function shortModel(model?: string | null): string {
  if (!model) return "";
  // e.g. "eu.anthropic.claude-opus-4-8" -> "claude-opus-4-8";
  //      "accounts/fireworks/routers/kimi-k2" -> "kimi-k2"
  const slashed = model.split("/").pop() ?? model;
  const parts = slashed.split(".");
  return parts[parts.length - 1] || slashed;
}

/** A compact one-line summary of a session's date range. */
export function sessionDateRange(startedAt?: string | null, endedAt?: string | null): string {
  if (!startedAt) return "";
  const startDate = fmtDate(startedAt);
  if (!endedAt || fmtDate(endedAt) === startDate) {
    return `${startDate}, ${fmtTime(startedAt)}`;
  }
  return `${startDate} – ${fmtDate(endedAt)}`;
}
