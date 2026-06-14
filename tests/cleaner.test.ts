/**
 * Self-contained cleaner tests (no private data needed).
 *
 * Synthetic logs for every adapter live in `tests/fixtures/raw/`; the canonical
 * Python `clean_logs.py` was run over them to produce `tests/fixtures/expected/`.
 * These tests assert the TS port reproduces that output (JSON + Markdown) and
 * spot-check the user-text cleaning rules. Regenerate expected output with:
 *
 *   python3 ../log-cleaning/clean_logs.py --raw tests/fixtures/raw --out tests/fixtures/expected
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { processParticipant, renderMarkdown } from "../src/cleaner/clean";
import { DEFAULT_OPTIONS, type ParticipantDoc } from "../src/cleaner/types";
import type { ParticipantInput } from "../src/cleaner/clean";
import { cleanUserText, normTs, inferProvider } from "../src/cleaner/text";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "fixtures/raw");
const EXPECTED = path.join(HERE, "fixtures/expected");

function buildInput(fileName: string): ParticipantInput {
  const id = fileName.replace(/\.[^.]+$/, "");
  const text = fs.readFileSync(path.join(RAW, fileName), "utf-8");
  return {
    id,
    sourcePath: `raw/${fileName}`,
    kind: "file",
    files: [{ relPath: fileName, name: fileName, text }],
  };
}

function stripVolatile(doc: ParticipantDoc) {
  const { generated_at: _g, detection_scores: _d, ...rest } = doc;
  void _g;
  void _d;
  return rest;
}

const FIXTURES = fs
  .readdirSync(RAW)
  .filter((f) => f !== ".DS_Store")
  .sort();

describe("cleaner matches canonical Python output on synthetic fixtures", () => {
  for (const fileName of FIXTURES) {
    const id = fileName.replace(/\.[^.]+$/, "");

    it(`JSON parity: ${id}`, () => {
      const expected: ParticipantDoc = JSON.parse(
        fs.readFileSync(path.join(EXPECTED, `${id}.json`), "utf-8"),
      );
      const actual = processParticipant(buildInput(fileName), DEFAULT_OPTIONS);
      expect(stripVolatile(actual)).toEqual(stripVolatile(expected));
      for (const file of Object.keys(expected.detection_scores)) {
        for (const adapter of Object.keys(expected.detection_scores[file])) {
          expect(
            Math.abs(actual.detection_scores[file][adapter] - expected.detection_scores[file][adapter]),
          ).toBeLessThanOrEqual(0.001);
        }
      }
    });

    it(`Markdown parity: ${id}`, () => {
      const expectedMd = fs.readFileSync(path.join(EXPECTED, `${id}.md`), "utf-8");
      const actual = processParticipant(buildInput(fileName), DEFAULT_OPTIONS);
      expect(renderMarkdown(actual)).toEqual(expectedMd);
    });
  }
});

describe("claude-classic cleaning rules", () => {
  const doc = processParticipant(buildInput("claude-classic.jsonl"), DEFAULT_OPTIONS);

  it("produces two sessions ordered by start time", () => {
    expect(doc.sessions.map((s) => s.session_id)).toEqual(["s1", "s2"]);
  });

  it("merges consecutive assistant turns across a tool-only turn", () => {
    expect(doc.sessions[0].messages[1]).toMatchObject({
      role: "assistant",
      text: "Sure!\n\nHere is more.",
    });
  });

  it("drops bare slash commands but keeps ones with args", () => {
    const userTexts = doc.sessions[0].messages.filter((m) => m.role === "user").map((m) => m.text);
    expect(userTexts).toContain("/model opus");
    expect(userTexts).not.toContain("/clear");
  });

  it("strips system-reminder boilerplate from prompts", () => {
    const userTexts = doc.sessions[0].messages.filter((m) => m.role === "user").map((m) => m.text);
    expect(userTexts).toContain("Real question here.");
  });

  it("drops sidechain, synthetic and meta turns", () => {
    const allText = doc.sessions.flatMap((s) => s.messages.map((m) => m.text)).join("\n");
    expect(allText).not.toContain("sidechain answer");
    expect(allText).not.toContain("API error injected");
    expect(allText).not.toContain("meta line");
  });
});

describe("cleanUserText", () => {
  it("keeps genuine free text", () => {
    expect(cleanUserText("  hello world  ")).toBe("hello world");
  });
  it("drops empty / whitespace", () => {
    expect(cleanUserText("")).toBeNull();
    expect(cleanUserText("   ")).toBeNull();
    expect(cleanUserText(null)).toBeNull();
  });
  it("drops interruption markers", () => {
    expect(cleanUserText("[Request interrupted by user]")).toBeNull();
    expect(cleanUserText("[Request interrupted by user for tool use]")).toBeNull();
  });
  it("drops context-compaction summaries", () => {
    expect(cleanUserText("This session is being continued from a previous conversation...")).toBeNull();
  });
  it("drops injected context blocks", () => {
    expect(cleanUserText("<environment_context>cwd=/x</environment_context>")).toBeNull();
    expect(cleanUserText("[SYSTEM NOTIFICATION] something")).toBeNull();
  });
  it("handles slash commands", () => {
    expect(
      cleanUserText("<command-name>/clear</command-name><command-args></command-args>"),
    ).toBeNull();
    expect(
      cleanUserText("<command-name>/model</command-name><command-args>opus</command-args>"),
    ).toBe("/model opus");
  });
  it("strips inline boilerplate but keeps the prompt", () => {
    expect(cleanUserText("Do the thing.<system-reminder>noise</system-reminder>")).toBe("Do the thing.");
  });
});

describe("low-level helpers", () => {
  it("normTs handles epoch ms, epoch s and ISO strings", () => {
    expect(normTs(1735731600000)).toBe("2025-01-01T11:40:00.000Z");
    expect(normTs(1735731600)).toBe("2025-01-01T11:40:00.000Z");
    expect(normTs("2026-01-01T10:00:00.000Z")).toBe("2026-01-01T10:00:00.000Z");
    expect(normTs(null)).toBeNull();
    expect(normTs("")).toBeNull();
  });
  it("inferProvider maps model ids to providers", () => {
    expect(inferProvider("claude-opus-4-8")).toBe("anthropic");
    expect(inferProvider("gpt-4o")).toBe("openai");
    expect(inferProvider("gemini-2.0")).toBe("google");
    expect(inferProvider("mystery-model-x")).toBeNull();
  });
});
