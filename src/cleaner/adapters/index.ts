/**
 * Adapter registry and routing. Detection scores decide the winner; registry
 * order is only a tiebreak (first adapter with the max score wins).
 */

import type { Adapter } from "./base";
import { ClaudeClassicAdapter } from "./claudeClassic";
import { ClaudeV3Adapter } from "./claudeV3";
import { CodexAdapter } from "./codex";
import { ChatGPTExportAdapter } from "./chatgptExport";
import { GenericAdapter } from "./generic";

export type { Adapter } from "./base";

// Order matters only as a tiebreak; detection scores decide the winner.
export const ADAPTERS: Adapter[] = [
  new ClaudeClassicAdapter(),
  new ClaudeV3Adapter(),
  new CodexAdapter(),
  new ChatGPTExportAdapter(),
  new GenericAdapter(),
];

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Score every adapter against a sample and return the best plus all scores. */
export function chooseAdapter(sample: unknown[]): {
  adapter: Adapter;
  scores: Record<string, number>;
} {
  const scores: Record<string, number> = {};
  let best: Adapter | null = null;
  let bestScore = -1.0;
  for (const ad of ADAPTERS) {
    let sc: number;
    try {
      sc = ad.detect(sample);
    } catch {
      sc = 0.0; // an adapter's detector must never crash the run
    }
    scores[ad.name] = round3(sc);
    if (sc > bestScore) {
      bestScore = sc;
      best = ad;
    }
  }
  return { adapter: best ?? new GenericAdapter(), scores };
}
