import type { AnalysisSnapshot, Node, Span } from "../analysis/types";
import { createPositionIndex } from "./positions";
import { identity, validateCommand, type DocumentIdentity, type EditCommand, type SourceRange } from "./commands";
import type { DocumentState } from "./state";
export interface NodeRef extends DocumentIdentity { span: Span }
export interface DropTarget { node: NodeRef; placement: "before" | "inside" | "after" }
export function nodeRef(snapshot: AnalysisSnapshot, node: Node): NodeRef { return { documentId: snapshot.documentId, revision: snapshot.revision, span: node.span }; }
export function resolveNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): { node: Node; parent: Node | null; siblings: Node[] } {
  validateCommand(document, { ...reference, changes: [], label: "resolve" });
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Структура ещё обновляется");
  const find = (nodes: Node[], parent: Node | null): ReturnType<typeof resolveNode> | null => {
    for (const node of nodes) {
      if (node.span.start === reference.span.start && node.span.end === reference.span.end) return { node, parent, siblings: nodes };
      const nested = find(node.children, node); if (nested) return nested;
    }
    return null;
  };
  const result = find(snapshot.analysis.nodes, null);
  if (!result) throw new Error("Элемент больше не существует");
  if (!result.node.wellFormed) throw new Error("Сначала исправьте структуру этого блока");
  return result;
}
export function sourceRange(document: DocumentState, span: Span): SourceRange {
  const index = createPositionIndex(document.text); return { from: index.byteToUtf16(span.start), to: index.byteToUtf16(span.end) };
}
export function createSpoiler(document: DocumentState, range: SourceRange, title: string): EditCommand {
  const opening = `[spoiler=${title}]`;
  return { ...identity(document), label: "Создать спойлер", changes: range.from === range.to ? [{ from: range.from, to: range.to, insert: `${opening}[/spoiler]` }] : [{ from: range.from, to: range.from, insert: opening }, { from: range.to, to: range.to, insert: "[/spoiler]" }], selection: { from: range.from + opening.length, to: range.to + opening.length } };
}
export function renameSpoiler(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, title: string): EditCommand {
  const { node } = resolveNode(document, snapshot, reference);
  if (node.name !== "spoiler" || !node.openingSpan) throw new Error("Выберите спойлер");
  return { ...identity(document), label: "Изменить заголовок", changes: [{ ...sourceRange(document, node.openingSpan), insert: `[spoiler=${title}]` }] };
}
export function unwrapNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): EditCommand {
  const { node } = resolveNode(document, snapshot, reference);
  if (!node.openingSpan || !node.closingSpan) throw new Error("У блока нет парной оболочки");
  return { ...identity(document), label: "Убрать оболочку", changes: [node.openingSpan, node.closingSpan].map((span) => ({ ...sourceRange(document, span), insert: "" })) };
}
export function moveNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, target: DropTarget): EditCommand {
  const { node } = resolveNode(document, snapshot, reference), destination = resolveNode(document, snapshot, target.node).node;
  if (destination.span.start >= node.span.start && destination.span.end <= node.span.end) throw new Error("Нельзя переместить блок в самого себя или потомка");
  if (target.placement === "inside" && (destination.name !== "spoiler" || !destination.closingSpan)) throw new Error("Вложить можно в корректный спойлер");
  const index = createPositionIndex(document.text);
  const from = index.byteToUtf16(node.span.start), to = index.byteToUtf16(node.span.end);
  const at = index.byteToUtf16(target.placement === "before" ? destination.span.start : target.placement === "after" ? destination.span.end : destination.contentSpan.end);
  if (at > from && at < to) throw new Error("Пересекающееся перемещение");
  const endingFrom = (document.text.slice(0, from).match(/\n/g) ?? []).length;
  const insert = document.text.slice(from, to), count = (insert.match(/\n/g) ?? []).length;
  const newFrom = at >= to ? at - (to - from) : at;
  return { ...identity(document), label: "Переместить блок", changes: [{ from, to, insert: "" }, { from: at, to: at, insert, endings: document.endings.slice(endingFrom, endingFrom + count) }], selection: { from: newFrom, to: newFrom + insert.length } };
}
export function extractNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): EditCommand {
  const { parent } = resolveNode(document, snapshot, reference);
  if (!parent || parent.name !== "spoiler") throw new Error("Нет родительского спойлера");
  return moveNode(document, snapshot, reference, { node: nodeRef(snapshot, parent), placement: "after" });
}
