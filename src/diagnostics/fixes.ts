import type { AnalysisSnapshot, Diagnostic } from "../analysis/types";
import { allNodes } from "../document/formatting";
import { identity, validateCommand, type EditCommand } from "../document/commands";
import { sourceRange } from "../document/structure";
import { applyChanges, type DocumentState } from "../document/state";
import { countStructuralErrors, describeImpact } from "./consequences";
export interface FixSuggestion { id: string; title: string; command: EditCommand; needsParameter?: "url" | "color" | "title" | "size" | "font"; impact?: string }
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
    // Reopen an inner tag only if its own closing tag comes before the enclosing tags close; otherwise
    // the reopened tag would cross them and produce a new error (e.g. [b][i][color]x[/i][/b] … [/color]).
    const outer = new Set(stack.slice(0, index).map((item) => item.name ?? "")), pending = new Set(inner.map((item) => item.name ?? "")), reopenNames = new Set<string>(), local: string[] = [];
    for (const next of tokens.slice(at + 1)) {
      if (!pending.size) break;
      if (next.kind === "openingTag" && next.name !== "*") { local.push(next.name ?? ""); continue; }
      if (next.kind !== "closingTag") continue;
      const name = next.name ?? "", own = local.lastIndexOf(name);
      if (own >= 0) { local.splice(own); continue; }
      if (pending.has(name)) { pending.delete(name); reopenNames.add(name); continue; }
      if (outer.has(name)) break;
    }
    const closes = [...inner].reverse().map((item) => `[/${item.name}]`).join("");
    const variant = (reopen: typeof inner, id: string, title: string): FixSuggestion => ({
      id, title, command: { ...identity(document), label: "Исправить пересечение тегов", changes: [{ from: range.from, to: range.from, insert: closes }, { from: range.to, to: range.to, insert: reopen.map(raw).join("") }].filter((change) => change.insert) },
    });
    const smart = inner.filter((item) => reopenNames.has(item.name ?? ""));
    const variants = [variant(smart, `cross-${token.span.start}`, smart.length ? "Закрыть вложенные теги и открыть нужные снова после" : "Закрыть вложенные теги перед этим тегом")];
    if (smart.length) variants.push(variant([], `cross-close-${token.span.start}`, "Только закрыть вложенные теги перед этим тегом"));
    return [...variants, removal];
  }
  return [];
}
function escapedFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  const range = sourceRange(document, diagnostic.span), text = document.text.slice(range.from, range.to);
  const name = /^&#91;\/?([^=\s&]+)/i.exec(text)?.[1] ?? "", closing = text.startsWith("&#91;/");
  const restore = (value: string) => value.replace(/^&#91;/, "[").replace(/&#93;$/, "]");
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The forum's pair partner: the nearest matching escaped closing (or opening) tag.
  const lower = document.text.toLowerCase(), partnerText = closing ? null : `&#91;/${name.toLowerCase()}&#93;`;
  let partner: { from: number; to: number } | null = null;
  if (partnerText) { const at = lower.indexOf(partnerText, range.to); if (at >= 0) partner = { from: at, to: at + partnerText.length }; }
  else { const opening = [...document.text.slice(0, range.from).matchAll(new RegExp(`&#91;${escape(name)}(?:[= ][^&]*?)?&#93;`, "gi"))].at(-1); if (opening) partner = { from: opening.index, to: opening.index + opening[0].length }; }
  const pair = partner ? [partner, range].sort((a, b) => a.from - b.from) : [range];
  const insideParameter = allNodes(snapshot.analysis.nodes).some((node) => node.openingSpan && (() => { const tag = sourceRange(document, node.openingSpan!); return range.from >= tag.from && range.to <= tag.to; })());
  const shown = pair.map((part) => restore(document.text.slice(part.from, part.to))).join("…");
  const fixes: FixSuggestion[] = [{ id: `escaped-remove-${diagnostic.span.start}`, title: `Удалить преобразованн${pair.length > 1 ? "ые теги" : "ый тег"} ${shown}`, command: { ...identity(document), label: "Удалить преобразованный тег", changes: pair.map((part) => ({ ...part, insert: "" })) } }];
  if (!insideParameter) fixes.push({ id: `escaped-restore-${diagnostic.span.start}`, title: `Вернуть как BBCode ${shown}`, command: { ...identity(document), label: "Вернуть BBCode", changes: pair.map((part) => ({ ...part, insert: restore(document.text.slice(part.from, part.to)) })) } });
  return fixes;
}
/** Applies each candidate to a copy of the text, counts structural errors and orders the best first. */
function rankByImpact(document: DocumentState, fixes: FixSuggestion[]): FixSuggestion[] {
  if (fixes.length === 0) return fixes;
  const before = countStructuralErrors(document.text);
  const scored = fixes.map((fix, order) => {
    if (fix.needsParameter) return { fix, after: before, order };
    try { validateCommand(document, fix.command); return { fix, after: countStructuralErrors(applyChanges(document, fix.command.changes).text), order }; }
    catch { return { fix, after: Infinity, order }; }
  });
  return scored.sort((a, b) => a.after - b.after || a.order - b.order).map(({ fix, after }) => Number.isFinite(after) ? { ...fix, impact: describeImpact(before, after) } : fix);
}
export function suggestFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  return rankByImpact(document, rawFixes(document, snapshot, diagnostic));
}
function rawFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic): FixSuggestion[] {
  if (document.id !== snapshot.documentId || document.revision !== snapshot.revision || document.text !== snapshot.source) return [];
  const base = { ...identity(document), label: "Исправить разметку" };
  if (["crossedClosingTag", "unexpectedClosingTag"].includes(diagnostic.code)) {
    const range = sourceRange(document, diagnostic.span);
    const repair = closingOrderFixes(document, snapshot).find((fix) => fix.id === `order-${diagnostic.span.start}` || fix.command.changes.some((change) => change.from <= range.from && change.to >= range.to));
    if (repair) return [repair];
    if (diagnostic.code === "crossedClosingTag") return crossedFixes(document, snapshot, diagnostic);
    if (diagnostic.severity === "warning" || snapshot.analysis.diagnostics.some((item) => item.code === "crossedClosingTag")) return [];
  }
  if (diagnostic.code === "escapedBbcodeTag") return escapedFixes(document, snapshot, diagnostic);
  if (diagnostic.code === "unexpectedClosingTag") return [{ id: `remove-${diagnostic.span.start}`, title: "Удалить лишний закрывающий тег", command: { ...base, changes: [{ ...sourceRange(document, diagnostic.span), insert: "" }] } }];
  if (diagnostic.code === "unclosedTag") {
    // The forum may have escaped exactly the closing tag we are missing: &#91;/b&#93; after an unclosed [b].
    const open = allNodes(snapshot.analysis.nodes).find((node) => node.openingSpan?.start === diagnostic.span.start && !node.closingSpan && node.name && node.name !== "*");
    const escaped = open ? (() => {
      const after = sourceRange(document, open.openingSpan!).to, needle = `&#91;/${open.name!.toLowerCase()}&#93;`, at = document.text.toLowerCase().indexOf(needle, after);
      return at < 0 ? null : { from: at, to: at + needle.length };
    })() : null;
    const recovered: FixSuggestion[] = escaped && open ? [{ id: `close-escaped-${open.span.start}`, title: `Восстановить [/${open.name}] из преобразованного форумом`, command: { ...base, changes: [{ ...escaped, insert: `[/${open.name}]` }] } }] : [];
    return [...recovered, ...unclosedFixes(document, snapshot, diagnostic, base)];
  }
  return otherFixes(document, snapshot, diagnostic, base);
}
function unclosedFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic, base: { label: string } & ReturnType<typeof identity>): FixSuggestion[] {
  const nodes = allNodes(snapshot.analysis.nodes), broken = nodes.filter((node) => node.kind === "element" && !node.wellFormed && !node.closingSpan && node.name !== "*");
  if (broken.length !== 1 || snapshot.analysis.diagnostics.some((item) => item.code === "crossedClosingTag")) return [];
  const node = broken[0];
  if (node.openingSpan?.start !== diagnostic.span.start || !/^[a-z][a-z\d-]*$/i.test(node.name ?? "")) return [];
  const at = sourceRange(document, node.contentSpan).to;
  return [{ id: `close-${node.span.start}`, title: `Добавить [/${node.name}]`, command: { ...base, changes: [{ from: at, to: at, insert: `[/${node.name}]` }] } }];
}
function otherFixes(document: DocumentState, snapshot: AnalysisSnapshot, diagnostic: Diagnostic, base: { label: string } & ReturnType<typeof identity>): FixSuggestion[] {
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
