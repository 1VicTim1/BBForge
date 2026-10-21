import type { AnalysisSnapshot, Diagnostic } from "../analysis/types";
import { allNodes } from "../document/formatting";
import { identity, validateCommand, type EditCommand } from "../document/commands";
import { sourceRange } from "../document/structure";
import type { DocumentState } from "../document/state";
export interface FixSuggestion { id: string; title: string; command: EditCommand; needsParameter?: "url" | "color" | "title" | "size" | "font" }
export function suggestFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  if (document.id !== snapshot.documentId || document.revision !== snapshot.revision || document.text !== snapshot.source) return [];
  const base = { ...identity(document), label: "Исправить разметку" };
  if (diagnostic.code === "unexpectedClosingTag") return [{ id: `remove-${diagnostic.span.start}`, title: "Удалить лишний закрывающий тег", command: { ...base, changes: [{ ...sourceRange(document, diagnostic.span), insert: "" }] } }];
  if (diagnostic.code === "unclosedTag") {
    const nodes = allNodes(snapshot.analysis.nodes), broken = nodes.filter((node) => node.kind === "element" && !node.wellFormed && !node.closingSpan && node.name !== "*");
    if (broken.length !== 1 || snapshot.analysis.diagnostics.some((item) => item.code === "crossedClosingTag")) return [];
    const node = broken[0];
    if (node.openingSpan?.start !== diagnostic.span.start || !/^[a-z][a-z\d-]*$/i.test(node.name ?? "")) return [];
    const at = sourceRange(document, node.contentSpan).to;
    return [{ id: `close-${node.span.start}`, title: `Добавить [/${node.name}]`, command: { ...base, changes: [{ from: at, to: at, insert: `[/${node.name}]` }] } }];
  }
  if (diagnostic.code === "missingParameter") {
    const node = allNodes(snapshot.analysis.nodes).find((item) => item.openingSpan?.start === diagnostic.span.start && !item.parameter);
    if (node?.openingSpan && ["url", "color", "background", "spoiler", "size", "font"].includes(node.name ?? "")) {
      return [{ id: `parameter-${node.span.start}`, title: "Указать параметр тега", needsParameter: node.name === "url" ? "url" : node.name === "spoiler" ? "title" : node.name === "size" ? "size" : node.name === "font" ? "font" : "color", command: { ...base, changes: [{ ...sourceRange(document, node.openingSpan), insert: `[${node.name}=$VALUE]` }] } }];
    }
  }
  return [];
}
export function combineFixes(document: DocumentState, fixes: FixSuggestion[]): EditCommand {
  const seen = new Set<string>();
  for (const fix of fixes) {
    validateCommand(document, fix.command);
    if (fix.needsParameter || seen.has(fix.id)) throw new Error("Конфликтующие исправления или незаданный параметр");
    seen.add(fix.id);
  }
  const command = { ...identity(document), label: "Исправить выбранные ошибки", changes: fixes.flatMap((fix) => fix.command.changes) };
  validateCommand(document, command);
  const positions = command.changes.filter((item) => item.from === item.to).map((item) => item.from);
  if (new Set(positions).size !== positions.length) throw new Error("Исправления изменяют одну позицию");
  return command;
}
