/**
 * React hook that drives the cleaning worker and accumulates results.
 *
 * Spawns a fresh module worker per run, streams participant docs back as they
 * finish, and replaces (rather than duplicates) a participant re-dropped by id.
 */

import { useCallback, useRef, useState } from "react";
import type { ParticipantGroup } from "./ingest";
import { DEFAULT_OPTIONS, type ParticipantDoc } from "../cleaner/types";
import type { CleanRequest, CleanResponse } from "../cleaner.worker";

export interface CleanError {
  participant: string;
  message: string;
}

export type CleanStatus = "idle" | "working" | "done";

export interface CleanerState {
  docs: ParticipantDoc[];
  status: CleanStatus;
  progress: { done: number; total: number } | null;
  errors: CleanError[];
}

function replaceOrAppend(docs: ParticipantDoc[], doc: ParticipantDoc): ParticipantDoc[] {
  const idx = docs.findIndex((d) => d.participant === doc.participant);
  if (idx === -1) return [...docs, doc];
  const next = docs.slice();
  next[idx] = doc;
  return next;
}

export function useCleaner() {
  const [state, setState] = useState<CleanerState>({
    docs: [],
    status: "idle",
    progress: null,
    errors: [],
  });
  const workerRef = useRef<Worker | null>(null);

  const clean = useCallback((groups: ParticipantGroup[]) => {
    if (groups.length === 0) return;

    workerRef.current?.terminate();
    const worker = new Worker(new URL("../cleaner.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    setState((s) => ({
      ...s,
      status: "working",
      progress: { done: 0, total: groups.length },
      errors: [],
    }));

    worker.onmessage = (e: MessageEvent<CleanResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case "participant":
          setState((s) => ({ ...s, docs: replaceOrAppend(s.docs, msg.doc) }));
          break;
        case "progress":
          setState((s) => ({ ...s, progress: { done: msg.done, total: msg.total } }));
          break;
        case "error":
          setState((s) => ({
            ...s,
            errors: [...s.errors, { participant: msg.participant, message: msg.message }],
          }));
          break;
        case "done":
          setState((s) => ({ ...s, status: "done", progress: null }));
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          break;
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setState((s) => ({
        ...s,
        status: "done",
        progress: null,
        errors: [...s.errors, { participant: "(worker)", message: err.message }],
      }));
    };

    const req: CleanRequest = { groups, options: DEFAULT_OPTIONS };
    worker.postMessage(req);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({ docs: [], status: "idle", progress: null, errors: [] });
  }, []);

  const reportError = useCallback((participant: string, message: string) => {
    setState((s) => ({ ...s, errors: [...s.errors, { participant, message }] }));
  }, []);

  return { state, clean, reset, reportError };
}
