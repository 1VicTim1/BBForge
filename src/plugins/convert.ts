/**
 * HTML → BBCode by declarative rules from a plugin (contributes.converters).
 *
 * Each element takes the first rule whose `match` selector fits and whose placeholders all have
 * values; an element without a rule keeps only its content. Templates:
 *   {attr:href}              attribute value
 *   {style:color}            value from the style attribute (as written, e.g. "Red", "#0099FF")
 *   {text:.block-title}      plain text of a descendant (that descendant is left out of the body)
 *   {bbcode:.block-title}    converted descendant (left out of the body)
 *   |map:size  |hex  |font   filters: a table from `maps`, rgb() → #rrggbb, first font family
 *   ?                        at the end: the placeholder may be empty
 * The HTML is parsed into an inert document (DOMParser): no scripts run and nothing is loaded.
 */

export interface ConvertRule {
  match: string;
  /** Leave the element and everything in it out. */
  skip?: boolean;
  open?: string;
  close?: string;
  /** Put the result on its own lines. */
  block?: boolean;
  /** Body as plain text (line breaks kept), no markup inside: for code blocks. */
  raw?: boolean;
  /** A descendant whose content becomes the body instead of the element's own children. */
  content?: string;
  /** Do not convert the children at all (images and other leaves). */
  leaf?: boolean;
}
export interface Converter {
  id: string;
  title: string;
  description: string;
  hint: string;
  owner: string;
  rules: ConvertRule[];
  maps: Record<string, Record<string, string>>;
}

const MAX_INPUT = 2 * 1024 * 1024;
const string = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : undefined;
const validSelector = (selector: string) => { try { document.createDocumentFragment().querySelector(selector); return true; } catch { return false; } };

/** Checks a converter from a package; bad rules are dropped with a reason. */
export function validateConverter(raw: unknown, owner: string, warn: (text: string) => void): Converter | null {
  if (!raw || typeof raw !== "object") { warn("Конвертер: должен быть объектом"); return null; }
  const value = raw as Record<string, unknown>, id = string(value.id, 128) ?? "";
  if (!id.startsWith(`${owner}.`) || !/^[a-z0-9._-]+$/i.test(id)) { warn(`Конвертер ${id || "?"}: id должен начинаться с «${owner}.»`); return null; }
  const rules: ConvertRule[] = [];
  for (const entry of Array.isArray(value.rules) ? value.rules.slice(0, 500) : []) {
    const rule = entry as Record<string, unknown>, match = string(rule?.match, 300);
    if (!match || !validSelector(match)) { warn(`Конвертер ${id}: неверный селектор ${JSON.stringify(rule?.match)}`); continue; }
    const content = string(rule.content, 300);
    if (content !== undefined && !validSelector(content)) { warn(`Конвертер ${id}: неверный селектор content ${content}`); continue; }
    rules.push({ match, skip: rule.skip === true, open: string(rule.open, 300), close: string(rule.close, 300), block: rule.block === true, raw: rule.raw === true, leaf: rule.leaf === true, content });
  }
  if (!rules.length) { warn(`Конвертер ${id}: нет правил`); return null; }
  const maps: Converter["maps"] = {};
  if (value.maps && typeof value.maps === "object") for (const [name, table] of Object.entries(value.maps).slice(0, 50)) {
    if (table && typeof table === "object") maps[name] = Object.fromEntries(Object.entries(table).filter((pair): pair is [string, string] => typeof pair[1] === "string").map(([key, item]) => [key.toLowerCase(), item.slice(0, 40)]).slice(0, 500));
  }
  return { id, title: string(value.title, 80) || id, description: string(value.description, 300) ?? "", hint: string(value.hint, 300) ?? "", owner, rules, maps };
}

const styleOf = (element: Element): Map<string, string> => new Map((element.getAttribute("style") ?? "").split(";").map((part) => part.split(":")).filter((pair) => pair.length >= 2).map(([key, ...rest]) => [key.trim().toLowerCase(), rest.join(":").trim()] as [string, string]));
const hex = (value: string) => {
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
  return rgb ? `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}` : value;
};
/** Values go inside "[tag=…]": no brackets, quotes or line breaks. */
const clean = (value: string) => value.replace(/[[\]"\r\n]/g, "").trim();

export function convertHtml(html: string, converter: Converter): string {
  if (html.length > MAX_INPUT) throw new Error("HTML больше 2 МБ");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = parsed.body;
  const ruleFor = new Map<Element, { rule: ConvertRule; open: string; close: string; consumed: Set<Element> }>();
  const fill = (template: string, element: Element, consumed: Set<Element>): string | null => {
    let missing = false;
    const result = template.replace(/\{(attr|style|text|bbcode):([^|}?]+)((?:\|[^}?]+)*)(\?)?\}/g, (_, kind: string, key: string, filters: string, optional?: string) => {
      let value = "";
      if (kind === "attr") value = element.getAttribute(key.trim()) ?? "";
      else if (kind === "style") value = styleOf(element).get(key.trim().toLowerCase()) ?? "";
      else {
        const target = element.querySelector(key.trim());
        if (target) { consumed.add(target); value = kind === "text" ? (target.textContent ?? "").replace(/\s+/g, " ").trim() : convertChildren(target).replace(/[\s\uE003]+/g, " ").trim(); }
      }
      for (const filter of filters.split("|").slice(1)) {
        const [name, argument] = filter.split(":").map((part) => part.trim());
        if (name === "map") value = converter.maps[argument]?.[value.toLowerCase()] ?? "";
        else if (name === "hex") value = hex(value);
        else if (name === "font") value = value.split(",")[0].replace(/["']/g, "").trim();
      }
      if (kind !== "bbcode") value = clean(value);
      if (!value && !optional) missing = true;
      return value;
    });
    return missing ? null : result;
  };
  const pick = (element: Element) => {
    if (ruleFor.has(element)) return ruleFor.get(element)!;
    let found = null as { rule: ConvertRule; open: string; close: string; consumed: Set<Element> } | null;
    for (const rule of converter.rules) {
      if (!element.matches(rule.match)) continue;
      const consumed = new Set<Element>();
      const open = rule.open === undefined ? "" : fill(rule.open, element, consumed), close = rule.close === undefined ? "" : fill(rule.close, element, consumed);
      if (open === null || close === null) continue;
      found = { rule, open, close, consumed }; break;
    }
    if (found) ruleFor.set(element, found);
    return found;
  };
  const rawText = (node: globalThis.Node): string => Array.from(node.childNodes).map((child) => child.nodeType === 3 ? child.textContent ?? "" : (child as Element).tagName === "BR" ? "\n" : rawText(child) + ((child as Element).tagName === "DIV" || (child as Element).tagName === "P" ? "\n" : "")).join("");
  function convertChildren(node: globalThis.Node, skip: Set<Element> = new Set()): string {
    return Array.from(node.childNodes).map((child) => {
      if (child.nodeType === 3) return (child.textContent ?? "").replace(/\s+/g, " ");
      if (child.nodeType !== 1 || skip.has(child as Element)) return "";
      return convertElement(child as Element);
    }).join("");
  }
  function convertElement(element: Element): string {
    const found = pick(element);
    if (found?.rule.skip) return "";
    const rule = found?.rule;
    const source = rule?.content ? element.querySelector(rule.content) ?? element : element;
    // Raw text (code) is protected from the final whitespace tidying by private-use markers.
    const body = rule?.leaf ? "" : rule?.raw ? rawText(source).replace(/^\n+|\n+$/g, "").replace(/ /g, RAW_SPACE).replace(/\t/g, RAW_TAB).replace(/\n/g, RAW_BREAK) : convertChildren(source, found?.consumed);
    const result = `${found?.open ?? ""}${body}${found?.close ?? ""}`;
    return rule?.block ? `${BLOCK}${result}${BLOCK}` : result;
  }
  return tidy(convertChildren(root));
}

const RAW_SPACE = "\uE000", RAW_TAB = "\uE001", RAW_BREAK = "\uE002", BLOCK = "\uE003";
/**
 * Block edges become one line break (two when <br>s asked for an empty line), then: spaces around
 * line breaks go, at most one empty line in a row, no blank edges.
 */
function tidy(text: string): string {
  return text.replace(/[\s\uE003]*\uE003[\s\uE003]*/g, (run) => (run.match(/\n/g)?.length ?? 0) >= 2 ? "\n\n" : "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "")
    .replace(/\uE000/g, " ").replace(/\uE001/g, "\t").replace(/\uE002/g, "\n");
}
