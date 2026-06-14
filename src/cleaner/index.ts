/**
 * Public API of the in-browser log cleaner.
 *
 * Faithful TypeScript port of `clean_logs.py`. Given already-read log files, it
 * produces the same clean, uniform per-participant document the Python emits —
 * verified against the Python's output by the parity test in `tests/`.
 */

export {
  processParticipant,
  cleanParticipants,
  renderMarkdown,
  type InputFile,
  type ParticipantInput,
} from "./clean";

export {
  DEFAULT_OPTIONS,
  type Options,
  type ParticipantDoc,
  type CleanSession,
  type CleanMessage,
} from "./types";

export { ADAPTERS, chooseAdapter } from "./adapters";
