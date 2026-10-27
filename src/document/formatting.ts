import type { AnalysisSnapshot, Node } from "../analysis/types";
import { safeExternalUrl } from "../components/Preview";
import type { VisualRange } from "../builder/selection";
import { identity, validateCommand, type EditCommand } from "./commands";
import { createPositionIndex } from "./positions";
import { sourceRange } from "./structure";
import type { DocumentState } from "./state";
import { builtinOf, tagFor, tagSpec } from "../bbcode/profile";
export type FormatTag = "b" | "i" | "u" | "s" | "color" | "background" | "url" | "quote" | "code" | "list";
export interface FormattingActionState { state: "on" | "off" | "mixed" | "disabled"; reason?: string }
export function allNodes(nodes: Node[]): Node[] { return nodes.flatMap((node) => [node, ...allNodes(node.children)]); }
export function formatState(snapshot: AnalysisSnapshot, range: VisualRange, tag: FormatTag): "on" | "off" | "mixed" {
  if (range.documentId !== snapshot.documentId || range.revision !== snapshot.revision) return "off";
  const index = createPositionIndex(snapshot.source), from = index.utf16ToByte(range.from), to = index.utf16ToByte(range.to);
  const matches = allNodes(snapshot.analysis.nodes).filter((node) => builtinOf(node.name) === tag);
  if (matches.some((node) => from === to ? node.span.start <= from && node.span.end >= to : node.contentSpan.start <= from && node.contentSpan.end >= to)) return "on";
  return matches.some((node) => node.span.start < to && node.span.end > from) ? "mixed" : "off";
}
export function formattingActionState(document: DocumentState, snapshot: AnalysisSnapshot | null, range: VisualRange, tag: FormatTag): FormattingActionState {
  if (!snapshot || snapshot.documentId !== document.id || snapshot.revision !== document.revision) return { state: "disabled", reason: "Структура документа ещё обновляется" };
  try {
    applyFormat(document, snapshot, range, tag, tag === "url" ? "https://example.com" : tag === "color" || tag === "background" ? "#ffffff" : undefined);
    return { state: formatState(snapshot, range, tag) };
  } catch (reason) { return { state: "disabled", reason: String(reason) }; }
}
export function applyFormat(document: DocumentState, snapshot: AnalysisSnapshot, range: VisualRange, tag: FormatTag, parameter?: string): EditCommand {
  validateCommand(document, { ...range, label: "format", changes: [] });
  if (snapshot.documentId !== document.id || snapshot.revision !== document.revision || snapshot.source !== document.text) throw new Error("Дождитесь обновления структуры");
  const index = createPositionIndex(document.text); let from = index.utf16ToByte(range.from), to = index.utf16ToByte(range.to);
  const nodes = allNodes(snapshot.analysis.nodes);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of nodes) {
      if (from === node.contentSpan.start && to > node.span.end && node.span.start < from) { from = node.span.start; expanded = true; }
      if (to === node.contentSpan.end && from < node.span.start && node.span.end > to) { to = node.span.end; expanded = true; }
    }
  }
  const commandRange = { from: index.byteToUtf16(from), to: index.byteToUtf16(to) };
  const adjacent = from === to ? nodes.filter((node) => builtinOf(node.name) === tag && node.openingSpan && node.closingSpan && node.span.start <= from && node.span.end >= to).sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0] : undefined;
  const exact = nodes.find((node) => builtinOf(node.name) === tag && node.openingSpan && node.closingSpan && ((node.contentSpan.start === from && node.contentSpan.end === to) || (node.span.start === from && node.span.end === to)));
  const existing = adjacent ?? exact;
  const name = existing?.name ?? tagFor(tag);
  const opening = `[${name}${parameter === undefined ? "" : `=${tag === "url" ? `"${parameter.replace(/"/g, "%22")}"` : parameter}`}]`;
  if (existing?.openingSpan) {
    if (parameter !== undefined) return { ...identity(document), label: "Изменить оформление", changes: [{ ...sourceRange(document, existing.openingSpan), insert: opening }] };
    return { ...identity(document), label: "Снять оформление", changes: [existing.openingSpan, existing.closingSpan!].map((span) => ({ ...sourceRange(document, span), insert: "" })) };
  }
  if ((tag === "color" || tag === "background") && !/^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(parameter ?? "")) throw new Error("Введите корректный цвет");
  if (tag === "url" && !safeExternalUrl(parameter ?? "")) throw new Error("Допустимы только ссылки http, https и mailto");
  for (const node of nodes.filter((item) => item.kind === "element")) {
    for (const span of [node.openingSpan, node.closingSpan]) {
      if (span && ((from > span.start && from < span.end) || (to > span.start && to < span.end))) throw new Error("Выделение разрезает тег. Выделите целый блок.");
    }
    const crosses = (from < node.span.start && to > node.contentSpan.start && to < node.span.end) || (from > node.span.start && from < node.contentSpan.end && to > node.span.end);
    if (crosses) throw new Error("Выделите целый блок, чтобы не разрезать структуру");
    if (!node.wellFormed && node.span.start < to && node.span.end > from) throw new Error("Сначала исправьте повреждённую разметку");
    if (tagSpec(node.name)?.raw && from >= node.contentSpan.start && to <= node.contentSpan.end) throw new Error(`Внутри ${node.name} форматирование недоступно`);
  }
  const start = tag === "list" ? `${opening}[${tagFor("*")}]` : opening;
  return { ...identity(document), label: "Применить оформление", changes: commandRange.from === commandRange.to ? [{ from: commandRange.from, to: commandRange.to, insert: `${start}[/${name}]` }] : [{ from: commandRange.from, to: commandRange.from, insert: start }, { from: commandRange.to, to: commandRange.to, insert: `[/${name}]` }], selection: { from: commandRange.from + start.length, to: commandRange.to + start.length } };
}
