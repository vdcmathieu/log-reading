/** Browser download helpers for exporting a cleaned participant. */

import { renderMarkdown } from "../cleaner/clean";
import type { ParticipantDoc } from "../cleaner/types";

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadJson(doc: ParticipantDoc): void {
  downloadText(`${doc.participant}.json`, JSON.stringify(doc, null, 2), "application/json");
}

export function downloadMarkdown(doc: ParticipantDoc): void {
  downloadText(`${doc.participant}.md`, renderMarkdown(doc), "text/markdown");
}
