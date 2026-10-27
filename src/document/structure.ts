import type { AnalysisSnapshot, Node, Span } from "../analysis/types";
import { createPositionIndex } from "./positions";
import { identity, validateCommand, type DocumentIdentity, type EditCommand, type SourceRange } from "./commands";
import type { DocumentState } from "./state";
import { builtinOf, tagFor, tagSpec, type BuiltinTag } from "../bbcode/profile";
const is = (node: Node | null | undefined, tag: BuiltinTag) => builtinOf(node?.name) === tag;
const isRaw = (node: Node) => !!tagSpec(node.name)?.raw;
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
export function createSpoiler(document: DocumentState, range: SourceRange, title: string, snapshot: AnalysisSnapshot): EditCommand {
  validateWrap(document, snapshot, range);
  const name = tagFor("spoiler"), opening = `[${name}=${title}]`, closing = `[/${name}]`;
  return { ...identity(document), label: "Создать спойлер", changes: range.from === range.to ? [{ from: range.from, to: range.to, insert: `${opening}${closing}` }] : [{ from: range.from, to: range.from, insert: opening }, { from: range.to, to: range.to, insert: closing }], selection: { from: range.from + opening.length, to: range.to + opening.length } };
}
export function nestedSpoilerRange(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange, selected: NodeRef | null): SourceRange {
  if (!selected) return range;
  try {
    const { node } = resolveNode(document, snapshot, selected);
    const span = sourceRange(document, node.span);
    if (!is(node, "spoiler") || range.from !== span.from || range.to !== span.to) return range;
    const content = sourceRange(document, node.contentSpan);
    return { from: content.to, to: content.to };
  } catch {
    return range;
  }
}
export function validateWrap(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange): void {
  if (!snapshot || snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  validateCommand(document, { ...identity(document), label: "range", changes: [{ ...range, insert: "" }] });
  const visit = (nodes: Node[]) => { for (const node of nodes) {
    const span = sourceRange(document, node.span), content = sourceRange(document, node.contentSpan);
    for (const part of [node.openingSpan, node.closingSpan]) {
      if (!part) continue; const tag = sourceRange(document, part);
      if ((range.from > tag.from && range.from < tag.to) || (range.to > tag.from && range.to < tag.to)) throw new Error("Выделение разрезает тег");
    }
    if ((range.from < span.from && range.to > content.from && range.to < span.to) || (range.from > span.from && range.from < content.to && range.to > span.to)) throw new Error("Выделите целый блок");
    if (!node.wellFormed && range.from < span.to && range.to > span.from) throw new Error("Сначала исправьте разметку");
    if (isRaw(node) && range.from >= content.from && range.to <= content.to) throw new Error(`Внутри ${node.name} создание блоков недоступно`);
    visit(node.children);
  } }; visit(snapshot.analysis.nodes);
}
export function renameSpoiler(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, title: string): EditCommand {
  const { node } = resolveNode(document, snapshot, reference);
  if (!is(node, "spoiler") || !node.openingSpan) throw new Error("Выберите спойлер");
  return { ...identity(document), label: "Изменить заголовок", changes: [{ ...sourceRange(document, node.openingSpan), insert: `[${node.name}=${title}]` }] };
}
export function unwrapNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): EditCommand {
  const { node } = resolveNode(document, snapshot, reference);
  if (!node.openingSpan || !node.closingSpan) throw new Error("У блока нет парной оболочки");
  return { ...identity(document), label: "Снять тег", changes: [node.openingSpan, node.closingSpan].map((span) => ({ ...sourceRange(document, span), insert: "" })) };
}
function placeAt(document: DocumentState, node: Node, at: number, copy: boolean): EditCommand {
  const index = createPositionIndex(document.text);
  const from = index.byteToUtf16(node.span.start), to = index.byteToUtf16(node.span.end);
  if (!copy && at > from && at < to) throw new Error("Нельзя переместить блок в самого себя или потомка");
  const endingFrom = (document.text.slice(0, from).match(/\n/g) ?? []).length;
  const insert = document.text.slice(from, to), count = (insert.match(/\n/g) ?? []).length;
  const endings = document.endings.slice(endingFrom, endingFrom + count);
  if (copy) return { ...identity(document), label: "Копировать блок", changes: [{ from: at, to: at, insert, endings }], selection: { from: at, to: at + insert.length } };
  const newFrom = at >= to ? at - (to - from) : at;
  return { ...identity(document), label: "Переместить блок", changes: [{ from, to, insert: "" }, { from: at, to: at, insert, endings }], selection: { from: newFrom, to: newFrom + insert.length } };
}
function placeNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, target: DropTarget, copy: boolean): EditCommand {
  const { node } = resolveNode(document, snapshot, reference), resolved = resolveNode(document, snapshot, target.node), destination = resolved.node;
  if (is(node, "*") && (target.placement === "inside" || !is(destination, "*") || !is(resolved.parent, "list"))) throw new Error("Элемент списка можно перемещать только рядом с другим элементом списка");
  if (!copy && destination.span.start >= node.span.start && destination.span.end <= node.span.end) throw new Error("Нельзя переместить блок в самого себя или потомка");
  if (target.placement === "inside" && (!is(destination, "spoiler") || !destination.closingSpan)) throw new Error("Вложить можно в корректный спойлер");
  const index = createPositionIndex(document.text);
  return placeAt(document, node, index.byteToUtf16(target.placement === "before" ? destination.span.start : target.placement === "after" ? destination.span.end : destination.contentSpan.end), copy);
}
/** Moves or copies a whole block to an arbitrary UTF-16 position between tags or inside text. */
export function placeNodeAt(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, at: number, copy: boolean): EditCommand | null {
  const { node } = resolveNode(document, snapshot, reference);
  if (is(node, "*")) throw new Error("Элемент списка можно перемещать только рядом с другим элементом списка");
  validateCommand(document, { ...identity(document), label: "range", changes: [{ from: at, to: at, insert: "" }] });
  const index = createPositionIndex(document.text);
  const visit = (nodes: Node[]) => { for (const candidate of nodes) {
    for (const part of [candidate.openingSpan, candidate.closingSpan]) {
      if (part && at > index.byteToUtf16(part.start) && at < index.byteToUtf16(part.end)) throw new Error("Сюда нельзя вставить блок: место внутри тега");
    }
    if (isRaw(candidate) && at > index.byteToUtf16(candidate.contentSpan.start) && at < index.byteToUtf16(candidate.contentSpan.end)) throw new Error(`Внутри ${candidate.name} вставка блоков недоступна`);
    visit(candidate.children);
  } };
  visit(snapshot.analysis.nodes);
  if (!copy && (at === index.byteToUtf16(node.span.start) || at === index.byteToUtf16(node.span.end))) return null;
  return placeAt(document, node, at, copy);
}
export function moveNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, target: DropTarget): EditCommand { return placeNode(document, snapshot, reference, target, false); }
export function copyNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef, target: DropTarget): EditCommand { return placeNode(document, snapshot, reference, target, true); }
export function extractNode(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): EditCommand {
  const { parent } = resolveNode(document, snapshot, reference);
  if (!parent || !is(parent, "spoiler")) throw new Error("Нет родительского спойлера");
  return moveNode(document, snapshot, reference, { node: nodeRef(snapshot, parent), placement: "after" });
}

const portableTags = new Set<string>(["b", "i", "u", "s", "color", "background", "url", "quote", "code", "size", "font", "left", "center", "right", "sub", "sup"]);
/** Wrappers that travel with moved text: built-in formatting and plain inline tags of the profile. */
const portableFormatting = { has: (name: string) => { const spec = tagSpec(name); return !!spec && (spec.builtin ? portableTags.has(spec.builtin) : spec.role === "inline" && !spec.leaf); } };

function activeFormatting(document: DocumentState, snapshot: AnalysisSnapshot, position: number, edge: "start" | "end"): Array<{ node: Node; content: SourceRange }> {
  const index = createPositionIndex(document.text), active: Array<{ node: Node; content: SourceRange }> = [];
  const visit = (nodes: Node[]) => {
    for (const node of nodes) {
      if (!node.wellFormed || !node.openingSpan || !node.closingSpan || !portableFormatting.has(node.name ?? "")) { visit(node.children); continue; }
      const content = { from: index.byteToUtf16(node.contentSpan.start), to: index.byteToUtf16(node.contentSpan.end) };
      const contains = edge === "start" ? content.from <= position && position < content.to : content.from < position && position <= content.to;
      if (contains) active.push({ node, content });
      visit(node.children);
    }
  };
  visit(snapshot.analysis.nodes);
  return active;
}

function formattedFragment(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange) {
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  validateCommand(document, { ...identity(document), label: "range", changes: [{ ...range, insert: "" }] });
  if (range.from === range.to) throw new Error("Сначала выделите текст");
  const index = createPositionIndex(document.text);
  const start = activeFormatting(document, snapshot, range.from, "start");
  const end = activeFormatting(document, snapshot, range.to, "end");
  const opening = (entry: { node: Node }) => document.text.slice(index.byteToUtf16(entry.node.openingSpan!.start), index.byteToUtf16(entry.node.openingSpan!.end));
  const closing = (entry: { node: Node }) => document.text.slice(index.byteToUtf16(entry.node.closingSpan!.start), index.byteToUtf16(entry.node.closingSpan!.end));
  const insert = start.map(opening).join("") + document.text.slice(range.from, range.to) + [...end].reverse().map(closing).join("");
  const repair = [...start].reverse().filter((entry) => !end.some((candidate) => candidate.node === entry.node)).map(closing).join("")
    + end.filter((entry) => !start.some((candidate) => candidate.node === entry.node)).map(opening).join("");
  const endingFrom = (document.text.slice(0, range.from).match(/\n/g) ?? []).length;
  const endingCount = (document.text.slice(range.from, range.to).match(/\n/g) ?? []).length;
  return { insert, repair, endings: document.endings.slice(endingFrom, endingFrom + endingCount) };
}

/**
 * Replaces a visual selection with typed text (empty for Backspace/Delete). Formatting the
 * selection only partly covers stays balanced: [b]ab|c[/b]d|e → [b]ab[/b]e with the text typed
 * inside the formatting the selection started in.
 */
export function replaceVisualRange(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange, text: string): EditCommand {
  const fragment = formattedFragment(document, snapshot, range);
  return {
    ...identity(document), label: text ? "Ввод текста" : "Удалить выделенное",
    changes: [{ ...range, insert: text + fragment.repair }],
    selection: { from: range.from + text.length, to: range.from + text.length },
  };
}

export function moveVisualRange(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange, at: number): EditCommand {
  if (at >= range.from && at <= range.to) throw new Error("Перетащите выделение в другое место");
  const fragment = formattedFragment(document, snapshot, range);
  const delta = fragment.repair.length - (range.to - range.from);
  const selectionFrom = at > range.to ? at + delta : at;
  return {
    ...identity(document), label: "Переместить форматированный текст",
    changes: [{ ...range, insert: fragment.repair }, { from: at, to: at, insert: fragment.insert, endings: fragment.endings }],
    selection: { from: selectionFrom, to: selectionFrom + fragment.insert.length },
  };
}

export function copyVisualRange(document: DocumentState, snapshot: AnalysisSnapshot, range: SourceRange, at: number): EditCommand {
  if (at > document.text.length) throw new Error("Неверное место вставки");
  const fragment = formattedFragment(document, snapshot, range);
  return {
    ...identity(document), label: "Копировать форматированный текст",
    changes: [{ from: at, to: at, insert: fragment.insert, endings: fragment.endings }],
    selection: { from: at, to: at + fragment.insert.length },
  };
}

function tidyContainer(document: DocumentState, index: ReturnType<typeof createPositionIndex>, children: Node[], edges: boolean, changes: EditCommand["changes"]) {
  children.forEach((child, at) => {
    if (child.kind !== "text") return;
    const from = index.byteToUtf16(child.span.start), to = index.byteToUtf16(child.span.end), text = document.text.slice(from, to);
    const before = children[at - 1], after = children[at + 1];
    const blockOrEdge = (node: Node | undefined) => node ? is(node, "spoiler") : edges;
    let next: string;
    if (!text.trim() && blockOrEdge(before) && blockOrEdge(after) && (is(before, "spoiler") || is(after, "spoiler"))) next = "";
    else {
      next = text.replace(/\n(?:[ \t]*\n)+/g, "\n\n");
      if (edges && at === 0) next = next.replace(/^\s*\n/, "");
      if (edges && at === children.length - 1) next = next.replace(/\n\s*$/, "");
    }
    if (next !== text) changes.push({ from, to, insert: next });
  });
}
function tidyNested(document: DocumentState, index: ReturnType<typeof createPositionIndex>, nodes: Node[], changes: EditCommand["changes"]) {
  for (const node of nodes) {
    if (node.kind === "text" || !node.wellFormed || isRaw(node)) continue;
    if (is(node, "spoiler")) tidyContainer(document, index, node.children, true, changes);
    tidyNested(document, index, node.children, changes);
  }
}

/** Removes blank lines at the edges of a spoiler, between its nested spoilers, and collapses runs of blank lines. */
export function tidyBlankLines(document: DocumentState, snapshot: AnalysisSnapshot, reference: NodeRef): EditCommand | null {
  const { node } = resolveNode(document, snapshot, reference);
  if (!is(node, "spoiler")) throw new Error("Выберите спойлер");
  const index = createPositionIndex(document.text), changes: EditCommand["changes"] = [];
  tidyContainer(document, index, node.children, true, changes);
  tidyNested(document, index, node.children, changes);
  return changes.length ? { ...identity(document), label: "Убрать пустые строки", changes } : null;
}

/** Document-wide variant: also removes blank lines between top-level spoilers. */
export function tidyDocumentBlankLines(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  const index = createPositionIndex(document.text), changes: EditCommand["changes"] = [];
  tidyContainer(document, index, snapshot.analysis.nodes, false, changes);
  tidyNested(document, index, snapshot.analysis.nodes, changes);
  return changes.length ? { ...identity(document), label: "Убрать пустые строки в документе", changes } : null;
}
