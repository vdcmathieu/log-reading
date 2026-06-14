/**
 * Parity test — the gold standard for the TS port's fidelity.
 *
 * Runs the in-browser TS cleaner over the *real* sample logs in the sibling
 * `log-cleaning/raw-logs/` and asserts its output matches what the canonical
 * Python `clean_logs.py` wrote to `log-cleaning/clean-logs/`.
 *
 * That sibling data is real, private content — it lives outside this repo and is
 * never committed. If it isn't present (e.g. on CI or another machine), the test
 * skips itself rather than failing.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { processParticipant } from "../src/cleaner/clean";
import { DEFAULT_OPTIONS, type ParticipantDoc } from "../src/cleaner/types";
import type { InputFile, ParticipantInput } from "../src/cleaner/clean";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_CLEANING = path.resolve(HERE, "../../log-cleaning");
const RAW_ROOT = path.join(LOG_CLEANING, "raw-logs");
const CLEAN_ROOT = path.join(LOG_CLEANING, "clean-logs");

const HAVE_DATA = fs.existsSync(RAW_ROOT) && fs.existsSync(CLEAN_ROOT);

const JSON_EXTS = [".jsonl", ".ndjson", ".json", ".log"];

/** Compare two paths the way CPython sorts `Path` objects: componentwise. */
function comparePathParts(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return pa.length - pb.length;
}

/** All descendant files under `dir`, as paths relative to `dir`. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Replicate `participant_files`: per-extension, sorted, de-duped, skip .DS_Store.
 *  Returned paths are relative to RAW_ROOT (e.g. "P093/session.jsonl"), matching
 *  the Python's `f.relative_to(raw_root)`. */
function participantFiles(source: string): string[] {
  const stat = fs.statSync(source);
  if (stat.isFile()) return [path.basename(source)];
  const all = walk(source, RAW_ROOT);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ext of JSON_EXTS) {
    const matching = all.filter((r) => r.toLowerCase().endsWith(ext));
    matching.sort(comparePathParts);
    for (const r of matching) {
      const name = r.split("/").pop()!;
      if (name === ".DS_Store" || seen.has(r)) continue;
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

function buildInput(childName: string): ParticipantInput {
  const source = path.join(RAW_ROOT, childName);
  const stat = fs.statSync(source);
  const isFile = stat.isFile();
  const id = isFile ? childName.replace(/\.[^.]+$/, "") : childName;
  const relPaths = participantFiles(source);
  const files: InputFile[] = relPaths.map((rel) => {
    // For a top-level file, rel is its basename; otherwise rel is "<child>/...".
    const abs = isFile ? source : path.join(RAW_ROOT, rel);
    return {
      relPath: rel,
      name: rel.split("/").pop()!,
      text: fs.readFileSync(abs, "utf-8"),
    };
  });
  return {
    id,
    sourcePath: `raw-logs/${childName}`,
    kind: isFile ? "file" : "folder",
    files,
  };
}

/** Strip volatile / tolerance-compared fields so the rest can be compared exactly. */
function stripVolatile(doc: ParticipantDoc): Omit<ParticipantDoc, "generated_at" | "detection_scores"> {
  const { generated_at: _g, detection_scores: _d, ...rest } = doc;
  void _g;
  void _d;
  return rest;
}

describe.skipIf(!HAVE_DATA)("parity with Python clean_logs.py", () => {
  const children = HAVE_DATA
    ? fs
        .readdirSync(RAW_ROOT, { withFileTypes: true })
        .filter((e) => e.name !== ".DS_Store")
        .filter((e) => e.isDirectory() || JSON_EXTS.includes(path.extname(e.name).toLowerCase()))
        .map((e) => e.name)
        .sort()
    : [];

  it("has sample participants to compare", () => {
    expect(children.length).toBeGreaterThan(0);
  });

  for (const child of children) {
    const id = fs.statSync(path.join(RAW_ROOT, child)).isFile()
      ? child.replace(/\.[^.]+$/, "")
      : child;

    it(`matches Python output for ${id}`, () => {
      const expectedPath = path.join(CLEAN_ROOT, `${id}.json`);
      expect(fs.existsSync(expectedPath), `missing ${expectedPath}`).toBe(true);
      const expected: ParticipantDoc = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));

      const actual = processParticipant(buildInput(child), DEFAULT_OPTIONS);

      // Everything except generated_at / detection_scores must match exactly.
      expect(stripVolatile(actual)).toEqual(stripVolatile(expected));

      // Detection scores: same adapters scored, values within rounding tolerance.
      expect(Object.keys(actual.detection_scores).sort()).toEqual(
        Object.keys(expected.detection_scores).sort(),
      );
      for (const file of Object.keys(expected.detection_scores)) {
        const exp = expected.detection_scores[file];
        const act = actual.detection_scores[file];
        expect(Object.keys(act).sort()).toEqual(Object.keys(exp).sort());
        for (const adapter of Object.keys(exp)) {
          expect(Math.abs(act[adapter] - exp[adapter])).toBeLessThanOrEqual(0.001);
        }
      }
    });
  }
});
