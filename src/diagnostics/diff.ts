import type { TextChange } from "../document/state";
import { applyChanges, type DocumentState } from "../document/state";

export interface DiffLine { kind: "removed" | "added" | "context"; text: string }

/** The changed lines before and after a set of changes, as a compact −/+ diff. */
export function lineDiff(document: DocumentState, changes: TextChange[], context = 0): DiffLine[] {
  if (!changes.length) return [];
  const next = applyChanges(document, changes).text;
  const low = Math.min(...changes.map((item) => item.from)), high = Math.max(...changes.map((item) => item.to));
  let start = document.text.lastIndexOf("\n", Math.max(0, low - 1)) + 1;
  let end = document.text.indexOf("\n", high); if (end < 0) end = document.text.length;
  for (let at = 0; at < context && start > 0; at++) start = document.text.lastIndexOf("\n", start - 2) + 1;
  const delta = next.length - document.text.length;
  const before = document.text.slice(start, end).split("\n"), after = next.slice(start, end + delta).split("\n");
  // Trim lines that did not change at both ends.
  let head = 0; while (head < before.length - 1 && head < after.length - 1 && before[head] === after[head]) head++;
  let tail = 0; while (tail < before.length - head - 1 && tail < after.length - head - 1 && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const lines: DiffLine[] = before.slice(0, head).map((text) => ({ kind: "context", text }));
  const removed = before.slice(head, before.length - tail), added = after.slice(head, after.length - tail);
  lines.push(...removed.map((text) => ({ kind: "removed" as const, text })));
  if (added.length === 1 && added[0] === "" && removed.some((line) => line !== "")) lines.push({ kind: "added", text: "" });
  else lines.push(...added.map((text) => ({ kind: "added" as const, text })));
  lines.push(...before.slice(before.length - tail).map((text) => ({ kind: "context" as const, text })));
  return lines;
}
