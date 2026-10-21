import type { AnalysisSnapshot, Node } from "../analysis/types";
import { safeExternalUrl } from "../components/Preview";
import type { VisualRange } from "../builder/selection";
import { identity, validateCommand, type EditCommand } from "./commands";
import { createPositionIndex } from "./positions";
import { sourceRange } from "./structure";
import type { DocumentState } from "./state";
export type FormatTag = "b" | "i" | "u" | "s" | "color" | "background" | "url" | "quote" | "code" | "list";
export function allNodes(nodes: Node[]): Node[] { return nodes.flatMap((node) => [node, ...allNodes(node.children)]); }
export function formatState(snapshot: AnalysisSnapshot, range: VisualRange, tag: FormatTag): "on" | "off" | "mixed" {
  if (range.documentId !== snapshot.documentId || range.revision !== snapshot.revision) return "off";
  const index = createPositionIndex(snapshot.source), from = index.utf16ToByte(range.from), to = index.utf16ToByte(range.to);
  const matches = allNodes(snapshot.analysis.nodes).filter((node) => node.name === tag);
  if (matches.some((node) => node.contentSpan.start <= from && node.contentSpan.end >= to)) return "on";
  return matches.some((node) => node.span.start < to && node.span.end > from) ? "mixed" : "off";
}
export function applyFormat(document: DocumentState, snapshot: AnalysisSnapshot, range: VisualRange, tag: FormatTag, parameter?: string): EditCommand {
  validateCommand(document, { ...range, label: "format", changes: [] });
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  if ((tag === "color" || tag === "background") && !/^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(parameter ?? "")) throw new Error("Введите корректный цвет");
  if (tag === "url" && !safeExternalUrl(parameter ?? "")) throw new Error("Допустимы только ссылки http, https и mailto");
  const index = createPositionIndex(document.text), from = index.utf16ToByte(range.from), to = index.utf16ToByte(range.to);
  const nodes = allNodes(snapshot.analysis.nodes);
  for (const node of nodes.filter((item) => item.kind === "element")) {
    for (const span of [node.openingSpan, node.closingSpan]) {
      if (span && ((from > span.start && from < span.end) || (to > span.start && to < span.end))) throw new Error("Выделение разрезает тег. Выделите целый блок.");
    }
    const crosses = (from < node.span.start && to > node.contentSpan.start && to < node.span.end) || (from > node.span.start && from < node.contentSpan.end && to > node.span.end);
    if (crosses) throw new Error("Выделите целый блок, чтобы не разрезать структуру");
    if (!node.wellFormed && node.span.start < to && node.span.end > from) throw new Error("Сначала исправьте повреждённую разметку");
    if (node.name === "code" && from >= node.contentSpan.start && to <= node.contentSpan.end) throw new Error("Внутри code форматирование недоступно");
  }
  const existing = nodes.find((node) => node.name === tag && node.contentSpan.start === from && node.contentSpan.end === to && node.openingSpan && node.closingSpan);
  const opening = `[${tag}${parameter === undefined ? "" : `=${tag === "url" ? `"${parameter.replace(/"/g, "%22")}"` : parameter}`}]`;
  if (existing?.openingSpan) {
    if (parameter !== undefined) return { ...identity(document), label: "Изменить оформление", changes: [{ ...sourceRange(document, existing.openingSpan), insert: opening }] };
    return { ...identity(document), label: "Снять оформление", changes: [existing.openingSpan, existing.closingSpan!].map((span) => ({ ...sourceRange(document, span), insert: "" })) };
  }
  const start = tag === "list" ? `${opening}[*]` : opening;
  return { ...identity(document), label: "Применить оформление", changes: range.from === range.to ? [{ from: range.from, to: range.to, insert: `${start}[/${tag}]` }] : [{ from: range.from, to: range.from, insert: start }, { from: range.to, to: range.to, insert: `[/${tag}]` }], selection: { from: range.from + start.length, to: range.to + start.length } };
}
