/**
 * Adapter framework — base interface and small typed accessors.
 *
 * Each log format is handled by an adapter that reports how confident it is that
 * it understands a file (`detect`) and turns the file's records into cleaned
 * sessions (`parse`). The file is routed to the highest-confidence adapter.
 */

import type { Options, Session } from "../types";

export interface Adapter {
  readonly name: string;
  detect(sample: unknown[]): number;
  parse(records: unknown[], relPath: string, opts: Options): Session[];
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A record's value as a plain object, or `null`. */
export function asDict(v: unknown): Record<string, unknown> | null {
  return isPlainObject(v) ? v : null;
}

/** Keep only the plain-object records from a sample (mirrors `_dict_records`). */
export function dictRecords(sample: unknown[]): Record<string, unknown>[] {
  return sample.filter(isPlainObject);
}

/** Read a string field, or `undefined` if absent / not a string. */
export function getStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

/** The basename of a relative path, without its extension (Python `Path.stem`). */
export function stem(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}
