import type { AnalysisSnapshot, Node } from "../analysis/types";
import { identity, type EditCommand } from "./commands";
import { createPositionIndex } from "./positions";
import type { DocumentState } from "./state";

type Changes = EditCommand["changes"];
const inline = new Set(["b", "i", "u", "s", "color", "background", "size", "font", "url", "sub", "sup", "left", "center", "right"]);
const flags = new Set(["b", "i", "u", "s", "sub", "sup"]);

function context(document: DocumentState, snapshot: AnalysisSnapshot) {
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  const index = createPositionIndex(document.text);
  const range = (span: Node["span"]) => ({ from: index.byteToUtf16(span.start), to: index.byteToUtf16(span.end) });
  const raw = (span: Node["span"]) => { const { from, to } = range(span); return document.text.slice(from, to); };
  return { range, raw };
}
const command = (document: DocumentState, label: string, changes: Changes): EditCommand | null =>
  changes.length ? { ...identity(document), label, changes: changes.sort((a, b) => a.from - b.from) } : null;
const name = (node: Node) => node.name?.toLowerCase() ?? "";
const plainText = (node: Node, raw: (span: Node["span"]) => string): string | null => {
  if (node.kind === "text") return raw(node.span);
  if (!inline.has(name(node)) || !node.wellFormed) return null;
  let text = "";
  for (const child of node.children) { const part = plainText(child, raw); if (part === null) return null; text += part; }
  return text;
};

/** [b][/b], [color=red] [/color], [i][u][/u][/i] → their whitespace only. */
export function removeEmptyTags(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  const { range, raw } = context(document, snapshot), changes: Changes = [];
  const visit = (nodes: Node[]) => { for (const node of nodes) {
    if (node.kind === "text" || name(node) === "code") continue;
    const text = inline.has(name(node)) && node.closingSpan ? plainText(node, raw) : null;
    if (text !== null && !text.trim()) { changes.push({ ...range(node.span), insert: text }); continue; }
    visit(node.children);
  } };
  visit(snapshot.analysis.nodes);
  return command(document, "Удалить пустые теги", changes);
}

/** [b]a[/b][b]b[/b] → [b]ab[/b] when the opening tags are identical and nothing separates them. */
export function mergeAdjacentTags(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  const { range, raw } = context(document, snapshot), changes: Changes = [];
  const visit = (nodes: Node[]) => {
    nodes.forEach((node, at) => {
      const next = nodes[at + 1];
      if (next && node.kind === "element" && next.kind === "element" && node.wellFormed && next.wellFormed && inline.has(name(node)) && node.closingSpan && next.openingSpan
        && name(node) === name(next) && node.span.end === next.span.start && raw(node.openingSpan!).toLowerCase() === raw(next.openingSpan).toLowerCase()) {
        changes.push({ from: range(node.closingSpan).from, to: range(next.openingSpan).to, insert: "" });
      }
      if (name(node) !== "code") visit(node.children);
    });
  };
  visit(snapshot.analysis.nodes);
  return command(document, "Склеить соседние теги", changes);
}

/** [b]x [b]y[/b][/b] → [b]x y[/b]: inner b/i/u/s/sub/sup inside the same tag add nothing. */
export function removeRedundantNesting(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  const { range } = context(document, snapshot), changes: Changes = [];
  const visit = (nodes: Node[], active: Set<string>) => { for (const node of nodes) {
    if (node.kind === "text" || name(node) === "code") continue;
    const tag = name(node);
    if (flags.has(tag) && active.has(tag) && node.wellFormed && node.openingSpan && node.closingSpan) changes.push({ ...range(node.openingSpan), insert: "" }, { ...range(node.closingSpan), insert: "" });
    visit(node.children, flags.has(tag) ? new Set([...active, tag]) : active);
  } };
  visit(snapshot.analysis.nodes, new Set());
  return command(document, "Убрать повторное оформление", changes);
}

/** [B]…[/B], [SPOILER=X] → lower-case tag names; parameters are left untouched. */
export function lowercaseTagNames(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  const { range, raw } = context(document, snapshot), changes: Changes = [];
  const fix = (span: Node["span"] | null) => {
    if (!span) return;
    const text = raw(span), match = /^\[\/?([^\]=\s]+)/.exec(text);
    if (!match || match[1] === match[1].toLowerCase()) return;
    const start = range(span).from + match[0].length - match[1].length;
    changes.push({ from: start, to: start + match[1].length, insert: match[1].toLowerCase() });
  };
  const visit = (nodes: Node[]) => { for (const node of nodes) { if (node.kind === "text") continue; fix(node.openingSpan); fix(node.closingSpan); if (name(node) !== "code") visit(node.children); } };
  visit(snapshot.analysis.nodes);
  return command(document, "Привести теги к нижнему регистру", changes);
}

function codeRanges(snapshot: AnalysisSnapshot, range: (span: Node["span"]) => { from: number; to: number }) {
  const result: Array<{ from: number; to: number }> = [];
  const visit = (nodes: Node[]) => { for (const node of nodes) { if (name(node) === "code") result.push(range(node.span)); else visit(node.children); } };
  visit(snapshot.analysis.nodes);
  return result;
}

/** Trailing spaces and tabs before line breaks and at the end of the document, outside [code]. */
export function trimTrailingWhitespace(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  const { range } = context(document, snapshot), code = codeRanges(snapshot, range), changes: Changes = [];
  for (const match of document.text.matchAll(/[ \t]+(?=\n|$)/g)) {
    const from = match.index, to = from + match[0].length;
    if (!code.some((block) => from < block.to && to > block.from)) changes.push({ from, to, insert: "" });
  }
  return command(document, "Убрать пробелы в конце строк", changes);
}

/** &#91;LIST&#93; and similar fragments the forum produced from unrecognised BBCode. */
export function removeEscapedTags(document: DocumentState, snapshot: AnalysisSnapshot): EditCommand | null {
  context(document, snapshot);
  const changes: Changes = [...document.text.matchAll(/&#91;\/?[a-z*][\w*-]*(?:[= ][^&]*?)?&#93;/gi)].map((match) => ({ from: match.index, to: match.index + match[0].length, insert: "" }));
  return command(document, "Удалить преобразованные форумом теги", changes);
}
