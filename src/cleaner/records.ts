/**
 * Record reading — port of `iter_records` / `obj_stream` / `sample_records`.
 *
 * The Python reads from disk; in the browser we already hold the file's text, so
 * these operate on `(name, text)`. `.jsonl`/`.ndjson`/`.log` are parsed one
 * object per line; anything else is parsed as a single JSON document (a top-level
 * array yields its elements). A leading UTF-8 BOM and malformed lines are
 * tolerated — a bad line becomes a recorded error rather than aborting.
 */

export interface RawRecord {
  lineNo: number;
  /** Parsed value (may legitimately be `null` for a `null` line). */
  obj: unknown;
  /** Parse error message, or `null` when the line parsed. */
  error: string | null;
}

function suffixOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Yield `{lineNo, obj, error}` for every record in a file's text. */
export function iterRecords(name: string, rawText: string): RawRecord[] {
  const text = stripBom(rawText);
  const suffix = suffixOf(name);
  const out: RawRecord[] = [];

  if (suffix === ".jsonl" || suffix === ".ndjson" || suffix === ".log") {
    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s) continue;
      try {
        out.push({ lineNo: i + 1, obj: JSON.parse(s), error: null });
      } catch (exc) {
        out.push({ lineNo: i + 1, obj: null, error: String(exc) });
      }
    }
    return out;
  }

  // Treat everything else as a single JSON document.
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (exc) {
    out.push({ lineNo: 0, obj: null, error: String(exc) });
    return out;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      out.push({ lineNo: i + 1, obj: data[i], error: null });
    }
  } else {
    out.push({ lineNo: 1, obj: data, error: null });
  }
  return out;
}

/**
 * Stream just the successfully parsed objects, pushing any errors to `errors`.
 * Mirrors `obj_stream`: a `null` line is yielded (adapters filter non-objects).
 */
export function objStream(records: RawRecord[], name: string, errors: string[]): unknown[] {
  const out: unknown[] = [];
  for (const rec of records) {
    if (rec.error !== null) {
      errors.push(`${name}:${rec.lineNo} ${rec.error}`);
      continue;
    }
    out.push(rec.obj);
  }
  return out;
}

/** Up to `n` parsed, non-null objects from the front (used for format detection). */
export function sampleRecords(records: RawRecord[], n = 400): unknown[] {
  const out: unknown[] = [];
  for (const rec of records) {
    if (rec.error === null && rec.obj !== null && rec.obj !== undefined) {
      out.push(rec.obj);
      if (out.length >= n) break;
    }
  }
  return out;
}
