# Log Reader

Read complex log exports from multiple LLM sources as clean, readable conversations —
entirely in your browser.

Tools like ChatGPT, Claude Code and Codex each export their logs in a different, messy
format full of internal reasoning, tool calls and boilerplate. Log Reader normalizes any of
them into one clean shape and renders just the conversation — the prompts and the answers —
the way you originally saw it.

**Everything runs in your browser. Nothing is ever uploaded.** Files are read and cleaned
in-page, so the app works fully offline and your logs never leave your machine.

```
drop log exports ──▶ clean in a Web Worker (in-page) ──▶ read as a conversation
                     (no server, no upload)              + export clean JSON / Markdown
```

## Quick start

Requires Node 18+ and npm.

```bash
npm install
npm run dev       # open the printed localhost URL
```

Other scripts:

```bash
npm run build     # type-check + production build to dist/ (static, host anywhere)
npm run preview   # serve the production build locally
npm test          # run the test suite
npm run typecheck # type-check only
```

To use it: drop a log **file** or a **folder** of logs onto the page — or use **Choose files
/ Choose a folder**. Each file or folder you drop is read as one set of logs; drop several at
once to compare. Browse the sessions in the sidebar and read the transcript, then use
**↓ JSON / ↓ Markdown** to export the cleaned result.

## Supported formats

| Format | Source |
|---|---|
| Claude Code (classic & v3 session logs) | Claude Code CLI |
| Codex CLI | OpenAI Codex |
| ChatGPT data export (`conversations.json`) | ChatGPT |
| Generic fallback | best-effort for anything else |

New formats are added as small **adapters**; an unknown format still yields a readable
transcript via the generic fallback.

## How it works

The cleaning runs client-side in a Web Worker, so the UI stays responsive even on very large
logs. Each input file is routed to the highest-confidence adapter, normalized to a uniform
`{ role, text, … }` shape, and de-noised (internal reasoning, tool calls, system/meta lines
and injected boilerplate are dropped; consecutive assistant fragments are merged into one
answer). The result is rendered as a conversation and can be exported as JSON or Markdown.

```
src/
  cleaner/              the cleaning logic (format adapters + normalization)
  lib/                  drop/folder ingest, the worker hook, formatting, export
  components/           Dropzone, Sidebar, Conversation, MessageView, Markdown
  cleaner.worker.ts     reads files + runs the cleaner off the main thread
  App.tsx, main.tsx     app shell
tests/                  parity + unit tests and synthetic fixtures
```

## Tests

The cleaner is covered by unit tests plus a parity suite that checks its output against a
reference implementation and committed synthetic fixtures (one per format), so cleaning
behavior is verified, not assumed.

```bash
npm test
```

## Deploying

`npm run build` produces a static `dist/` with no server runtime, so it can be hosted on any
static host. Because cleaning is client-side, a hosted instance still never receives anyone's
logs.
