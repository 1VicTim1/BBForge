import type { AnalysisSnapshot, Diagnostic } from "../analysis/types";
import { allNodes } from "../document/formatting";
import { identity, validateCommand, type EditCommand } from "../document/commands";
import { sourceRange } from "../document/structure";
import type { DocumentState } from "../document/state";
export interface FixSuggestion { id: string; title: string; command: EditCommand; needsParameter?: "url" | "color" | "title" | "size" | "font" }
function closingOrderFixes(document: DocumentState, snapshot: AnalysisSnapshot): FixSuggestion[] {
  const fixes: FixSuggestion[] = [], stack: AnalysisSnapshot["analysis"]["tokens"] = [], tokens = snapshot.analysis.tokens;
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (token.kind === "openingTag") {
      if (token.name === "*" && stack.at(-1)?.name === "*") stack.pop();
      stack.push(token); continue;
    }
    if (token.kind !== "closingTag") continue;
    const run = [token];
    while (tokens[at + 1]?.kind === "closingTag" && tokens[at + 1].span.start === run.at(-1)!.span.end) run.push(tokens[++at]);
    const frames = stack.slice(-run.length), expected = frames.map((item) => item.name ?? "").reverse(), actual = run.map((item) => item.name ?? "");
    if (expected.length === run.length && !expected.includes("*") && new Set(expected).size === expected.length && [...actual].sort().join("|") === [...expected].sort().join("|") && actual.some((name, index) => name !== expected[index])) {
      const styledLink = actual.includes("url") && actual.some((name) => name === "color" || name === "background");
      const adjacentOpenings = frames.every((frame, index) => index === 0 || frames[index - 1].span.end === frame.span.start);
      if (styledLink && adjacentOpenings) {
        const rawOpenings = new Map(frames.map((frame) => [frame.name, document.text.slice(sourceRange(document, frame.span).from, sourceRange(document, frame.span).to)]));
        const desired = [...actual].reverse();
        fixes.push({ id: `order-${token.span.start}`, title: "Сохранить оформление ссылки", command: { ...identity(document), label: "Исправить вложенность ссылки", changes: [{ from: sourceRange(document, frames[0].span).from, to: sourceRange(document, frames.at(-1)!.span).to, insert: desired.map((name) => rawOpenings.get(name)!).join("") }] } });
        stack.splice(stack.length - run.length); continue;
      }
      const raw = new Map(run.map((item) => [item.name, document.text.slice(sourceRange(document, item.span).from, sourceRange(document, item.span).to)]));
      fixes.push({ id: `order-${token.span.start}`, title: "Восстановить порядок закрывающих тегов", command: { ...identity(document), label: "Исправить вложенность", changes: [{ from: sourceRange(document, token.span).from, to: sourceRange(document, run.at(-1)!.span).to, insert: expected.map((name) => raw.get(name)!).join("") }] } });
      stack.splice(stack.length - run.length); continue;
    }
    for (const closing of run) {
      if (closing.name === "list" && stack.at(-1)?.name === "*") stack.pop();
      const index = stack.map((item) => item.name ?? "").lastIndexOf(closing.name ?? ""); if (index >= 0) stack.splice(index);
    }
  }
  return fixes;
}
function crossedFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  const tokens = snapshot.analysis.tokens, stack: typeof tokens = [];
  const raw = (token: (typeof tokens)[number]) => { const range = sourceRange(document, token.span); return document.text.slice(range.from, range.to); };
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (token.kind === "openingTag") { if (token.name === "*" && stack.at(-1)?.name === "*") stack.pop(); stack.push(token); continue; }
    if (token.kind !== "closingTag") continue;
    if (token.name === "list" && stack.at(-1)?.name === "*") stack.pop();
    const index = stack.map((item) => item.name ?? "").lastIndexOf(token.name ?? "");
    if (index < 0) continue;
    if (token.span.start !== diagnostic.span.start) { stack.splice(index); continue; }
    const inner = stack.slice(index + 1), range = sourceRange(document, token.span);
    const removal: FixSuggestion = { id: `drop-${token.span.start}`, title: `Удалить пересекающий тег [/${token.name}]`, command: { ...identity(document), label: "Удалить пересекающий тег", changes: [{ ...range, insert: "" }] } };
    if (!inner.length || inner.some((item) => item.name === "*")) return [removal];
    const later = tokens.slice(at + 1);
    const reopen = inner.filter((item) => later.some((next) => next.kind === "closingTag" && next.name === item.name));
    const closes = [...inner].reverse().map((item) => `[/${item.name}]`).join("");
    return [{
      id: `cross-${token.span.start}`, title: reopen.length ? "Закрыть вложенные теги и открыть их снова после" : "Закрыть вложенные теги перед этим тегом",
      command: { ...identity(document), label: "Исправить пересечение тегов", changes: [{ from: range.from, to: range.from, insert: closes }, { from: range.to, to: range.to, insert: reopen.map(raw).join("") }].filter((change) => change.insert) },
    }, removal];
  }
  return [];
}
function escapedFixes(document: DocumentState, diagnostic: Diagnostic): FixSuggestion[] {
  const range = sourceRange(document, diagnostic.span), text = document.text.slice(range.from, range.to);
  const restored = text.replace(/^&#91;/, "[").replace(/&#93;$/, "]");
  return [
    { id: `escaped-remove-${diagnostic.span.start}`, title: `Удалить преобразованный тег ${restored}`, command: { ...identity(document), label: "Удалить преобразованный тег", changes: [{ ...range, insert: "" }] } },
    { id: `escaped-restore-${diagnostic.span.start}`, title: `Вернуть как BBCode ${restored}`, command: { ...identity(document), label: "Вернуть BBCode", changes: [{ ...range, insert: restored }] } },
  ];
}
export function suggestFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  if (document.id !== snapshot.documentId || document.revision !== snapshot.revision || document.text !== snapshot.source) return [];
  const base = { ...identity(document), label: "Исправить разметку" };
  if (["crossedClosingTag", "unexpectedClosingTag"].includes(diagnostic.code)) {
    const range = sourceRange(document, diagnostic.span);
    const repair = closingOrderFixes(document, snapshot).find((fix) => fix.id === `order-${diagnostic.span.start}` || fix.command.changes.some((change) => change.from <= range.from && change.to >= range.to));
    if (repair) return [repair];
    if (diagnostic.code === "crossedClosingTag") return crossedFixes(document, snapshot, diagnostic);
    if (diagnostic.severity === "warning" || snapshot.analysis.diagnostics.some((item) => item.code === "crossedClosingTag")) return [];
  }
  if (diagnostic.code === "escapedBbcodeTag") return escapedFixes(document, diagnostic);
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
