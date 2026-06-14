/**
 * Turn a drag-drop (or file-input) selection into participant groups, mirroring
 * how `clean_logs.py`'s `run()` treats a `raw-logs/` root: each top-level dropped
 * entry — a single log file, or a folder of files — is one participant.
 *
 * Reading file contents is deferred to the worker; this module only inspects
 * names/paths so it stays fast even for large drops.
 */

const JSON_EXTS = [".jsonl", ".ndjson", ".json", ".log"];

export interface GroupedFile {
  /** Path relative to the drop root, e.g. "P093/session.jsonl". */
  relPath: string;
  /** Basename, e.g. "session.jsonl". */
  name: string;
  file: File;
}

export interface ParticipantGroup {
  id: string;
  sourcePath: string;
  kind: "file" | "folder";
  files: GroupedFile[];
}

interface DroppedFile {
  relPath: string;
  file: File;
}

function baseName(p: string): string {
  return p.split("/").pop() ?? p;
}

function stem(p: string): string {
  const b = baseName(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(0, i) : b;
}

function hasJsonExt(name: string): boolean {
  const n = name.toLowerCase();
  return JSON_EXTS.some((e) => n.endsWith(e));
}

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

// --- drag-and-drop directory walking (webkitGetAsEntry) ---------------------

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const pump = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          pump();
        }
      }, reject);
    pump();
  });
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    out.push({ relPath: prefix + entry.name, file });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    for (const c of children) await walkEntry(c, prefix + entry.name + "/", out);
  }
}

/** Collect dropped files (recursing into folders) from a drop event. */
export async function gatherFromDataTransfer(dt: DataTransfer): Promise<DroppedFile[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  // Fallback: no entry API (rare) — use the flat file list.
  if (entries.length === 0) return gatherFromFileList(dt.files);
  const out: DroppedFile[] = [];
  for (const e of entries) await walkEntry(e, "", out);
  return out;
}

/** Collect files from an <input type=file> (supports webkitdirectory). */
export function gatherFromFileList(files: FileList): DroppedFile[] {
  return Array.from(files).map((file) => ({
    relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    file,
  }));
}

/** Replicate `participant_files`: per-extension, sorted, de-duped, skip .DS_Store. */
function orderFolderFiles(files: DroppedFile[]): GroupedFile[] {
  const seen = new Set<string>();
  const out: GroupedFile[] = [];
  for (const ext of JSON_EXTS) {
    const matching = files
      .filter((f) => f.relPath.toLowerCase().endsWith(ext) && baseName(f.relPath) !== ".DS_Store")
      .sort((a, b) => comparePathParts(a.relPath, b.relPath));
    for (const f of matching) {
      if (seen.has(f.relPath)) continue;
      seen.add(f.relPath);
      out.push({ relPath: f.relPath, name: baseName(f.relPath), file: f.file });
    }
  }
  return out;
}

/** Group dropped files into participants (one per top-level entry). */
export function groupParticipants(dropped: DroppedFile[]): ParticipantGroup[] {
  const bySegment = new Map<string, DroppedFile[]>();
  const order: string[] = [];
  for (const f of dropped) {
    const seg = f.relPath.split("/")[0];
    if (!bySegment.has(seg)) {
      bySegment.set(seg, []);
      order.push(seg);
    }
    bySegment.get(seg)!.push(f);
  }

  const result: ParticipantGroup[] = [];
  for (const seg of order) {
    const groupFiles = bySegment.get(seg)!;
    const isSingleTopLevelFile = groupFiles.length === 1 && groupFiles[0].relPath === seg;
    if (isSingleTopLevelFile) {
      const f = groupFiles[0];
      if (!hasJsonExt(f.relPath)) continue; // ignore stray non-log files
      result.push({
        id: stem(seg),
        sourcePath: seg,
        kind: "file",
        files: [{ relPath: f.relPath, name: baseName(f.relPath), file: f.file }],
      });
    } else {
      const files = orderFolderFiles(groupFiles);
      result.push({ id: seg, sourcePath: seg, kind: "folder", files });
    }
  }
  return result;
}
