import fourPda from "../../crates/bbcode-core/profiles/4pda.json";
import { validateRuleSets, type RuleSet } from "./rules";

/**
 * Forum profiles: the tags a forum knows and how each one behaves.
 *
 * Interface code never compares raw tag names. It asks for the built-in behaviour of a tag
 * (`builtinOf("hide")` → "spoiler" on a forum where [hide] is a spoiler) and writes new markup
 * with the tag name of the active profile (`tagFor("spoiler")` → "hide").
 */

export const BUILTIN_TAGS = ["b", "i", "u", "s", "sub", "sup", "size", "color", "background", "font", "url", "left", "center", "right", "img", "attachment", "spoiler", "quote", "code", "list", "*"] as const;
export type BuiltinTag = typeof BUILTIN_TAGS[number];
const builtinSet = new Set<string>(BUILTIN_TAGS);
export const isBuiltinTag = (value: unknown): value is BuiltinTag => typeof value === "string" && builtinSet.has(value);

/** Visual role of a tag: drives its colour in the code editor, the structure tree and the inspector. */
export type TagRole = "inline" | "block" | "media" | "item";
export type ValueRule = "none" | "optional" | "required";
export type ValueFormat = "color" | "url" | "size" | "font" | "text";

/** How the preview and the builder draw a tag without built-in behaviour. */
export interface RenderSpec {
  element: RenderElement;
  className?: string;
  /** CSS properties; "{value}" is replaced by the tag value when it matches the tag's valueFormat. */
  style?: Partial<Record<RenderStyle, string>>;
  /** Text shown before the content, e.g. "Модератор: {value}". */
  caption?: string;
}
export const RENDER_ELEMENTS = ["span", "div", "strong", "em", "u", "s", "sub", "sup", "small", "mark", "code", "pre", "blockquote", "ul", "ol", "li", "details"] as const;
export type RenderElement = typeof RENDER_ELEMENTS[number];
export const RENDER_STYLES = ["color", "backgroundColor", "fontSize", "fontFamily", "fontWeight", "fontStyle", "textDecoration", "textAlign", "border", "borderLeft", "borderRadius", "padding", "margin", "display"] as const;
export type RenderStyle = typeof RENDER_STYLES[number];

export interface TagSpec {
  name: string;
  /** Built-in behaviour; defaults to the name when the name is a built-in tag. */
  as?: BuiltinTag;
  role?: TagRole;
  label?: string;
  value?: ValueRule;
  valueFormat?: ValueFormat;
  blankCheck?: boolean;
  raw?: boolean;
  leaf?: boolean;
  render?: RenderSpec;
}

export interface TagProfile {
  id: string;
  name: string;
  description?: string;
  /** Another profile whose tags this one starts from. */
  extends?: string;
  /** Tags of the base profile this one drops. */
  removeTags?: string[];
  tags: TagSpec[];
  /** Section rules (limits, required fields) the user can switch on; see rules.ts. */
  ruleSets?: RuleSet[];
  /** Hints for automatic detection: forum domains in links, tags only this forum has. */
  detect?: { hosts?: string[]; tags?: string[] };
}

export interface ResolvedTag extends TagSpec { builtin: BuiltinTag | null; role: TagRole }
export interface ResolvedProfile {
  id: string;
  name: string;
  description: string;
  /** Plugin that added the profile; null for the built-in one. */
  source: string | null;
  tags: Map<string, ResolvedTag>;
  /** The tag name the profile uses for each built-in behaviour it supports. */
  names: Map<BuiltinTag, string>;
  /** Flat profile sent to the Rust analyser. */
  analyzer: TagProfile;
  /** Section rule sets, own ones over inherited ones with the same id. */
  ruleSets: RuleSet[];
}

const builtinRoles: Record<BuiltinTag, TagRole> = {
  b: "inline", i: "inline", u: "inline", s: "inline", sub: "inline", sup: "inline", size: "inline", color: "inline", background: "inline", font: "inline", url: "inline",
  left: "block", center: "block", right: "block", spoiler: "block", quote: "block", code: "block", list: "block", img: "media", attachment: "media", "*": "item",
};

export const DEFAULT_PROFILE_ID = "4pda";
const TAG_NAME = /^[a-z0-9*-]{1,32}$/;
const string = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : undefined;
const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => allowed.includes(value as T) ? value as T : undefined;

/** Checks a profile that came from a plugin: unknown fields are dropped, bad tags are skipped. */
export function validateProfile(raw: unknown): TagProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = string(value.id, 64);
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id) || !Array.isArray(value.tags)) return null;
  const tags: TagSpec[] = [];
  for (const item of value.tags.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const tag = item as Record<string, unknown>, name = string(tag.name, 32)?.trim().toLowerCase();
    if (!name || !TAG_NAME.test(name)) continue;
    const spec: TagSpec = { name };
    if (isBuiltinTag(tag.as)) spec.as = tag.as;
    spec.role = pick(tag.role, ["inline", "block", "media", "item"] as const);
    spec.label = string(tag.label, 80);
    spec.value = pick(tag.value, ["none", "optional", "required"] as const);
    spec.valueFormat = pick(tag.valueFormat, ["color", "url", "size", "font", "text"] as const);
    if (typeof tag.blankCheck === "boolean") spec.blankCheck = tag.blankCheck;
    if (typeof tag.raw === "boolean") spec.raw = tag.raw;
    if (typeof tag.leaf === "boolean") spec.leaf = tag.leaf;
    spec.render = validateRender(tag.render);
    tags.push(Object.fromEntries(Object.entries(spec).filter(([, field]) => field !== undefined)) as unknown as TagSpec);
  }
  const detect = value.detect && typeof value.detect === "object" ? value.detect as Record<string, unknown> : null;
  const names = (list: unknown, pattern: RegExp) => Array.isArray(list) ? list.filter((item): item is string => typeof item === "string" && pattern.test(item)).map((item) => item.toLowerCase()).slice(0, 50) : undefined;
  return {
    ruleSets: Array.isArray(value.ruleSets) ? validateRuleSets(value.ruleSets) : undefined,
    detect: detect ? { hosts: names(detect.hosts, /^[a-z0-9.-]{3,80}$/i), tags: names(detect.tags, TAG_NAME) } : undefined,
    id, name: string(value.name, 80) || id, description: string(value.description, 300),
    extends: string(value.extends, 64), removeTags: Array.isArray(value.removeTags) ? value.removeTags.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase()) : undefined,
    tags,
  };
}

function validateRender(raw: unknown): RenderSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>, element = pick(value.element, RENDER_ELEMENTS);
  if (!element) return undefined;
  const style: RenderSpec["style"] = {};
  if (value.style && typeof value.style === "object") for (const [key, entry] of Object.entries(value.style)) {
    if ((RENDER_STYLES as readonly string[]).includes(key) && typeof entry === "string" && SAFE_STYLE_VALUE.test(entry) && !forbiddenStyle.test(entry)) style[key as RenderStyle] = entry;
  }
  return { element, className: string(value.className, 80)?.replace(/[^\w -]/g, ""), style, caption: string(value.caption, 120) };
}
/** Plain CSS values only: no url(), expressions or escapes. */
const SAFE_STYLE_VALUE = /^[#\w\s.,%()+-]*(\{value\}[#\w\s.,%()+-]*)?$/;
const forbiddenStyle = /url\s*\(|expression|\\/i;

/** Flattens `extends` chains and fills in the defaults of built-in tags. */
export function resolveProfile(profile: TagProfile, lookup: (id: string) => TagProfile | undefined, source: string | null = null): ResolvedProfile {
  const chain: TagProfile[] = [];
  for (let current: TagProfile | undefined = profile, guard = 0; current && guard < 8; current = current.extends ? lookup(current.extends) : undefined, guard++) chain.unshift(current);
  const tags = new Map<string, ResolvedTag>();
  for (const level of chain) {
    for (const removed of level.removeTags ?? []) tags.delete(removed);
    for (const spec of level.tags) {
      const builtin = spec.as ?? (isBuiltinTag(spec.name) ? spec.name : null);
      const role = spec.role ?? (builtin ? builtinRoles[builtin] : "inline");
      const resolved: ResolvedTag = { ...spec, builtin, role };
      if (builtin === "code") resolved.raw = true;
      if (builtin === "attachment") resolved.leaf = true;
      if ((builtin === "color" || builtin === "background") && !resolved.valueFormat) resolved.valueFormat = "color";
      tags.set(spec.name, resolved);
    }
  }
  const names = new Map<BuiltinTag, string>();
  for (const tag of tags.values()) if (tag.builtin && (!names.has(tag.builtin) || tag.name === tag.builtin)) names.set(tag.builtin, tag.name);
  const analyzer: TagProfile = { id: profile.id, name: profile.name, tags: [...tags.values()].map(({ builtin, render: _render, label: _label, ...spec }) => ({ ...spec, as: builtin ?? undefined })) };
  const ruleSets = new Map<string, RuleSet>();
  for (const level of chain) for (const set of level.ruleSets ?? []) ruleSets.set(set.id, set);
  return { id: profile.id, name: profile.name, description: profile.description ?? "", source, tags, names, analyzer, ruleSets: [...ruleSets.values()] };
}

// ---- registry of known profiles and the active one ----

export const defaultProfile = validateProfile(fourPda)!;
interface Entry { profile: TagProfile; source: string | null }
let entries = new Map<string, Entry>([[defaultProfile.id, { profile: defaultProfile, source: null }]]);
let activeId = DEFAULT_PROFILE_ID;
let active = resolveProfile(defaultProfile, () => undefined);
let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; for (const listener of listeners) listener(); };
const lookup = (id: string) => entries.get(id)?.profile;
function recompute() {
  const entry = entries.get(activeId) ?? entries.get(DEFAULT_PROFILE_ID)!;
  active = resolveProfile(entry.profile, lookup, entry.source);
}

/** Replaces the profiles added by plugins; the built-in one always stays. */
let pluginProfilesKey = "[]";
export function setPluginProfiles(profiles: Array<{ profile: TagProfile; source: string }>) {
  // Reloading the same packages must not re-run the analysis of every document.
  const key = JSON.stringify(profiles);
  if (key === pluginProfilesKey) return;
  pluginProfilesKey = key;
  entries = new Map([[defaultProfile.id, { profile: defaultProfile, source: null }]]);
  for (const item of profiles) if (!entries.has(item.profile.id)) entries.set(item.profile.id, item);
  recompute(); changed();
}
export function setActiveProfile(id: string) {
  if (id === activeId && active.id === id) return;
  activeId = id; recompute(); changed();
}
/** Preference value meaning "pick the profile from the document". */
export const AUTO_PROFILE = "auto";
const TAG_IN_TEXT = /\[\/?([a-z0-9*-]{1,32})(?:=[^\]\n]*)?\]/gi, HOST_IN_TEXT = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\//gi;
/**
 * The profile that fits a document best: every distinct tag the profile knows counts +1, every
 * unknown one -2; the profile's own tags (detect.tags) +3 and links to its forum (detect.hosts) +5.
 * A tie keeps `current`, then the built-in profile.
 */
export function detectProfile(text: string, current: string = activeId): string {
  const used = new Set([...text.matchAll(TAG_IN_TEXT)].map((match) => match[1].toLowerCase()));
  const hosts = new Set([...text.matchAll(HOST_IN_TEXT)].map((match) => match[1].toLowerCase()));
  if (!used.size && !hosts.size) return current === AUTO_PROFILE ? DEFAULT_PROFILE_ID : current;
  let best = { id: DEFAULT_PROFILE_ID, score: -Infinity, rank: 2 };
  for (const { profile, source } of entries.values()) {
    const resolved = resolveProfile(profile, lookup, source);
    let score = 0;
    for (const name of used) score += resolved.tags.has(name) ? 1 : -2;
    for (const tag of profile.detect?.tags ?? []) if (used.has(tag)) score += 3;
    for (const host of profile.detect?.hosts ?? []) if ([...hosts].some((item) => item === host || item.endsWith(`.${host}`))) score += 5;
    const rank = profile.id === current ? 0 : profile.id === DEFAULT_PROFILE_ID ? 1 : 2;
    if (score > best.score || (score === best.score && rank < best.rank)) best = { id: profile.id, score, rank };
  }
  return best.id;
}

export const listProfiles = (): Array<{ id: string; name: string; description: string; source: string | null }> =>
  [...entries.values()].map(({ profile, source }) => ({ id: profile.id, name: profile.name, description: profile.description ?? "", source }));
export const activeProfile = () => active;
export const profileVersion = () => version;
export function subscribeProfiles(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

// ---- queries against the active profile ----

const lower = (name: string | null | undefined) => (name ?? "").toLowerCase();
export const tagSpec = (name: string | null | undefined): ResolvedTag | undefined => active.tags.get(lower(name));
/** Built-in behaviour of a tag in the active profile, or null for unknown and plain tags. */
export const builtinOf = (name: string | null | undefined): BuiltinTag | null => tagSpec(name)?.builtin ?? null;
/** True when the tag (given by name) behaves as one of the built-in tags. */
export const behavesAs = (name: string | null | undefined, ...builtins: BuiltinTag[]) => { const builtin = builtinOf(name); return builtin !== null && builtins.includes(builtin); };
/** The tag name the active profile uses for a built-in behaviour (the built-in name when it has none). */
export const tagFor = (builtin: BuiltinTag): string => active.names.get(builtin) ?? builtin;
/** Whether the active profile supports a built-in behaviour at all. */
export const supports = (builtin: BuiltinTag) => active.names.has(builtin);
export const isKnownTag = (name: string | null | undefined) => active.tags.has(lower(name));
export const tagRole = (name: string | null | undefined): TagRole | "unknown" => tagSpec(name)?.role ?? "unknown";
/** Names of the profile's tags with the given behaviours, e.g. for regular expressions. */
export const namesFor = (...builtins: BuiltinTag[]) => [...active.tags.values()].filter((tag) => tag.builtin && builtins.includes(tag.builtin)).map((tag) => tag.name);

/** A style value of a plain tag with "{value}" filled in, or null when the value does not fit. */
export function renderStyle(spec: ResolvedTag, value: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, template] of Object.entries(spec.render?.style ?? {})) {
    if (!template) continue;
    if (template.includes("{value}")) {
      if (!value || !valueFits(spec.valueFormat ?? "text", value)) continue;
      const filled = template.replace("{value}", value);
      if (!forbiddenStyle.test(filled)) result[key] = filled;
    } else result[key] = template;
  }
  return result;
}
export function valueFits(format: ValueFormat, value: string): boolean {
  if (format === "color") return /^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value);
  if (format === "size") return /^\d{1,2}$/.test(value);
  if (format === "font") return /^[\w -]{1,40}$/.test(value);
  if (format === "url") return /^(https?:|mailto:)/i.test(value);
  return /^[^;{}<>\\]{0,80}$/.test(value);
}
