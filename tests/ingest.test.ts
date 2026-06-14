/**
 * Tests for the drop -> participant grouping logic (the browser ingest step).
 * Pure and deterministic — uses Node's global `File`, no DOM needed.
 */

import { describe, it, expect } from "vitest";
import { groupParticipants } from "../src/lib/ingest";

const f = (relPath: string) => ({ relPath, file: new File(["{}"], relPath.split("/").pop()!) });

describe("groupParticipants", () => {
  it("treats a single top-level file as one participant", () => {
    const groups = groupParticipants([f("P006.jsonl")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "P006", kind: "file", sourcePath: "P006.jsonl" });
    expect(groups[0].files.map((x) => x.relPath)).toEqual(["P006.jsonl"]);
  });

  it("treats a folder as one participant and skips .DS_Store / non-log files", () => {
    const groups = groupParticipants([
      f("P093/.DS_Store"),
      f("P093/b.jsonl"),
      f("P093/a.jsonl"),
      f("P093/notes.txt"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "P093", kind: "folder" });
    expect(groups[0].files.map((x) => x.relPath)).toEqual(["P093/a.jsonl", "P093/b.jsonl"]);
  });

  it("orders folder files by extension group then path", () => {
    const groups = groupParticipants([f("X/z.json"), f("X/a.jsonl")]);
    // .jsonl group comes before .json group (JSON_EXTS order).
    expect(groups[0].files.map((x) => x.relPath)).toEqual(["X/a.jsonl", "X/z.json"]);
  });

  it("keeps multiple top-level entries as separate participants in drop order", () => {
    const groups = groupParticipants([f("P001.jsonl"), f("P002/s.jsonl"), f("P003.json")]);
    expect(groups.map((g) => g.id)).toEqual(["P001", "P002", "P003"]);
    expect(groups.map((g) => g.kind)).toEqual(["file", "folder", "file"]);
  });

  it("ignores a stray non-log file dropped on its own", () => {
    expect(groupParticipants([f("readme.md")])).toEqual([]);
  });
});
