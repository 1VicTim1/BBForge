import type { Analysis, Diagnostic, Node, Span } from "../analysis/types";
import type { BuiltinTag } from "./profile";

/**
 * Section rules of a forum profile ("ruleSets"): limits and required fields a section asks for.
 * Violations become diagnostics next to the analyser's own, code "rule:<rule id>".
 *
 *   { "id": "4pda-devices", "title": "4PDA: Android - Устройства", "rules": [
 *       { "id": "spoilers", "type": "maxCount", "tags": ["spoiler"], "max": 10, "message": "…" },
 *       { "id": "photos-hidden", "type": "insideOnly", "tags": ["img", "attachment"], "container": "spoiler", "message": "…" },
 *       { "id": "android", "type": "requiredText", "pattern": "Требуется Android", "message": "…" },
 *       { "id": "length", "type": "maxLength", "max": 65000, "message": "…" } ] }
 *
 * `tags` and `container` name built-in behaviours (a profile's [hide] that works as a spoiler counts as one);
 * `only` (a regular expression) narrows them to elements whose value or text matches, e.g. pictures
 * among [attachment]s.
 */
export type RuleSeverity = "error" | "warning" | "info";
export type SectionRule =
  | { id: string; type: "maxCount"; tags: BuiltinTag[]; only?: string; max: number; message: string; severity: RuleSeverity }
  | { id: string; type: "insideOnly"; tags: BuiltinTag[]; only?: string; container: BuiltinTag; message: string; severity: RuleSeverity }
  | { id: string; type: "requiredText"; pattern: string; message: string; severity: RuleSeverity }
  | { id: string; type: "maxLength"; max: number; message: string; severity: RuleSeverity };
export interface RuleSet { id: string; title: string; description: string; rules: SectionRule[] }

const BUILTINS = new Set(["b", "i", "u", "s", "sub", "sup", "size", "color", "background", "font", "url", "left", "center", "right", "img", "attachment", "spoiler", "quote", "code", "list", "*"]);
const tags = (value: unknown): BuiltinTag[] => Array.isArray(value) ? value.filter((item): item is BuiltinTag => typeof item === "string" && BUILTINS.has(item)) : [];
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";

/** Rule sets of a profile; malformed rules are left out. */
export function validateRuleSets(raw: unknown): RuleSet[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).flatMap((entry): RuleSet[] => {
    const set = (entry ?? {}) as Record<string, unknown>, id = text(set.id, 64);
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) return [];
    const rules = (Array.isArray(set.rules) ? set.rules : []).slice(0, 100).flatMap((item): SectionRule[] => {
      const rule = (item ?? {}) as Record<string, unknown>, ruleId = text(rule.id, 64), message = text(rule.message, 300);
      const severity: RuleSeverity = rule.severity === "error" || rule.severity === "info" ? rule.severity : "warning";
      if (!ruleId || !message) return [];
      let only: string | undefined;
      if (typeof rule.only === "string") { try { new RegExp(rule.only, "iu"); only = rule.only.slice(0, 300); } catch { return []; } }
      if (rule.type === "maxCount" && typeof rule.max === "number" && tags(rule.tags).length) return [{ id: ruleId, type: "maxCount", tags: tags(rule.tags), only, max: Math.max(0, Math.floor(rule.max)), message, severity }];
      if (rule.type === "insideOnly" && tags(rule.tags).length && tags([rule.container]).length) return [{ id: ruleId, type: "insideOnly", tags: tags(rule.tags), only, container: tags([rule.container])[0], message, severity }];
      if (rule.type === "requiredText" && typeof rule.pattern === "string") { try { new RegExp(rule.pattern, "iu"); return [{ id: ruleId, type: "requiredText", pattern: rule.pattern.slice(0, 300), message, severity }]; } catch { return []; } }
      if (rule.type === "maxLength" && typeof rule.max === "number") return [{ id: ruleId, type: "maxLength", max: Math.max(1, Math.floor(rule.max)), message, severity }];
      return [];
    });
    return [{ id, title: text(set.title, 80) || id, description: text(set.description, 300), rules }];
  });
}

/** Diagnostics for a rule set: each problem points at the element it is about (or the start of the document). */
/** `builtinOf` maps a tag name to its built-in behaviour in the active profile (profile.ts). */
export function checkRules(analysis: Analysis, source: string, set: RuleSet, builtinOf: (name: string | null) => BuiltinTag | null): Diagnostic[] {
  const bytes = new TextEncoder();
  const found: Diagnostic[] = [];
  const elements: Array<{ node: Node; ancestors: Node[] }> = [];
  const walk = (nodes: Node[], ancestors: Node[]) => { for (const node of nodes) { if (node.kind !== "element") continue; elements.push({ node, ancestors }); walk(node.children, [...ancestors, node]); } };
  walk(analysis.nodes, []);
  const encoded = bytes.encode(source), content = (node: Node) => new TextDecoder().decode(encoded.slice(node.contentSpan.start, node.contentSpan.end));
  const is = (node: Node, list: BuiltinTag[], only?: string) => {
    const builtin = builtinOf(node.name);
    return builtin !== null && list.includes(builtin) && (!only || new RegExp(only, "iu").test(`${node.parameter ?? ""} ${content(node)}`));
  };
  const report = (rule: SectionRule, span: Span, message = rule.message) => found.push({ code: `rule:${set.id}.${rule.id}`, severity: rule.severity, message, span: span.end > span.start ? { start: span.start, end: span.start + Math.min(span.end - span.start, 400) } : span, line: 0, column: 0 });
  for (const rule of set.rules) {
    if (rule.type === "maxCount") {
      const matches = elements.filter((item) => is(item.node, rule.tags, rule.only));
      // Point at the first one over the limit.
      if (matches.length > rule.max) report(rule, (matches[rule.max].node.openingSpan ?? matches[rule.max].node.span), `${rule.message} (сейчас ${matches.length}, можно ${rule.max})`);
    } else if (rule.type === "insideOnly") {
      for (const item of elements) if (is(item.node, rule.tags, rule.only) && !item.ancestors.some((ancestor) => builtinOf(ancestor.name) === rule.container)) report(rule, item.node.span);
    } else if (rule.type === "requiredText") {
      if (!new RegExp(rule.pattern, "iu").test(source)) report(rule, { start: 0, end: 0 });
    } else if (source.length > rule.max) {
      const at = bytes.encode(source.slice(0, rule.max)).length;
      report(rule, { start: at, end: at }, `${rule.message} (сейчас ${source.length} символов, можно ${rule.max})`);
    }
  }
  // Line and column the way the analyser gives them (1-based, by characters).
  const decoder = new TextDecoder(), all = bytes.encode(source);
  for (const item of found) {
    const prefix = decoder.decode(all.slice(0, item.span.start));
    item.line = (prefix.match(/\n/g)?.length ?? 0) + 1;
    item.column = Array.from(prefix.slice(prefix.lastIndexOf("\n") + 1)).length + 1;
  }
  return found;
}
