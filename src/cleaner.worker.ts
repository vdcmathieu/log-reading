/**
 * Cleaning worker — reads dropped files and runs the cleaner off the main
 * thread, so the UI stays responsive even on hundred-MB logs. File contents are
 * read here (inside the worker); nothing ever leaves the browser.
 */

import { processParticipant } from "./cleaner/clean";
import { DEFAULT_OPTIONS, type Options, type ParticipantDoc } from "./cleaner/types";
import type { ParticipantGroup } from "./lib/ingest";

export interface CleanRequest {
  groups: ParticipantGroup[];
  options?: Options;
}

export type CleanResponse =
  | { type: "progress"; done: number; total: number; participant: string }
  | { type: "participant"; doc: ParticipantDoc }
  | { type: "error"; participant: string; message: string }
  | { type: "done" };

const post = (msg: CleanResponse) => (self as unknown as Worker).postMessage(msg);

self.onmessage = async (e: MessageEvent<CleanRequest>) => {
  const { groups, options } = e.data;
  const opts = options ?? DEFAULT_OPTIONS;
  let done = 0;
  for (const g of groups) {
    try {
      const files = [];
      for (const f of g.files) {
        files.push({ relPath: f.relPath, name: f.name, text: await f.file.text() });
      }
      const doc = processParticipant(
        { id: g.id, sourcePath: g.sourcePath, kind: g.kind, files },
        opts,
      );
      post({ type: "participant", doc });
    } catch (err) {
      post({ type: "error", participant: g.id, message: String(err) });
    }
    done += 1;
    post({ type: "progress", done, total: groups.length, participant: g.id });
  }
  post({ type: "done" });
};
