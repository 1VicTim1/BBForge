import { identity, type EditCommand, type SourceRange } from "../document/commands";
import type { DocumentState } from "../document/state";
export function normalizeInput(text: string): string { return text.replace(/\r\n|\r/g, "\n"); }
export function literalPaste(text: string): string {
  if (/\[\/code\]/i.test(text)) throw new Error("Текст содержит [/code]. Вставьте его в режиме кода.");
  return `[code]${normalizeInput(text)}[/code]`;
}
export function textEditCommand(document: DocumentState, range: SourceRange, value: string): EditCommand {
  const text = normalizeInput(value), original = document.text.slice(range.from, range.to);
  let start = 0, oldEnd = original.length, newEnd = text.length;
  while (start < oldEnd && start < newEnd && original[start] === text[start]) start++;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(original[start] ?? "")) start--;
  while (oldEnd > start && newEnd > start && original[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
  if (oldEnd < original.length && /[\uDC00-\uDFFF]/.test(original[oldEnd])) { oldEnd++; newEnd++; }
  return { ...identity(document), label: "Изменить текст", changes: [{ from: range.from + start, to: range.from + oldEnd, insert: text.slice(start, newEnd) }] };
}
