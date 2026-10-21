export type LineEnding = "lf" | "crlf";

export interface DocumentState {
  id: string;
  revision: number;
  savedRevision: number;
  text: string;
  path: string | null;
  bom: boolean;
  endings: LineEnding[];
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
  endings?: LineEnding[];
}

const encoder = new TextEncoder();

export function decodeDocument(bytes: Uint8Array, path: string | null = null): DocumentState {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(bom ? 3 : 0));
  } catch {
    throw new Error("Файл не является корректным UTF-8");
  }
  const endings: LineEnding[] = [];
  const text = decoded.replace(/\r\n|\n/g, (ending) => {
    endings.push(ending === "\r\n" ? "crlf" : "lf");
    return "\n";
  });
  return { id: crypto.randomUUID(), revision: 0, savedRevision: 0, text, path, bom, endings };
}

export function applyChanges(document: DocumentState, changes: TextChange[]): DocumentState {
  let text = document.text;
  const endings = [...document.endings];
  const dominant = dominantEnding(endings);
  const ordered = [...changes].sort((left, right) => right.from - left.from);
  for (const change of ordered) {
    const before = text.slice(0, change.from);
    const removed = text.slice(change.from, change.to);
    const endingIndex = countNewlines(before);
    const removedCount = countNewlines(removed);
    const insertedCount = countNewlines(change.insert);
    const insertedEndings = change.endings ?? Array<LineEnding>(insertedCount).fill(dominant);
    if (insertedEndings.length !== insertedCount) throw new Error("Число типов переносов не совпадает с текстом");
    endings.splice(endingIndex, removedCount, ...insertedEndings);
    text = before + change.insert + text.slice(change.to);
  }
  return { ...document, text, endings, revision: document.revision + 1 };
}

export function serializeDocument(document: DocumentState): Uint8Array {
  let endingIndex = 0;
  const restored = document.text.replace(/\n/g, () => document.endings[endingIndex++] === "crlf" ? "\r\n" : "\n");
  const body = encoder.encode(restored);
  if (!document.bom) return body;
  const result = new Uint8Array(body.length + 3);
  result.set([0xef, 0xbb, 0xbf]);
  result.set(body, 3);
  return result;
}

function dominantEnding(endings: LineEnding[]): LineEnding {
  if (endings.length === 0) return "lf";
  const crlf = endings.filter((ending) => ending === "crlf").length;
  const lf = endings.length - crlf;
  if (crlf === lf) return endings[0];
  return crlf > lf ? "crlf" : "lf";
}

function countNewlines(value: string): number {
  return value.split("\n").length - 1;
}
