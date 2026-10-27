import { validateProfile, type TagProfile } from "../bbcode/profile";
import { validateTheme, type ThemeDef } from "./themes";
import { PERMISSIONS, type InstalledPackage } from "./types";
import { patchPermission, validatePatch, type OwnedPatch, type UiPatch } from "./ui";
import { satisfies } from "./semver";

/**
 * Turns installed packages into what the interface uses. A package touches only what its
 * manifest permits: every contribution needs its permission, otherwise it is skipped with a
 * warning shown on the package in the settings.
 */

export type PluginAction =
  | { insert: string }
  | { wrap: string; value?: string }
  | { command: string }
  | { setProfile: string }
  | { setTheme: string };
export interface PluginCommand { id: string; title: string; category: string; icon?: string; hint?: string; keys: string[]; action: PluginAction; owner: string }
export interface SlotInfo { id: string; title: string; owner: string }
/** Why a dependency keeps a package from loading. */
export interface DependencyIssue {
  id: string;
  requirement: string;
  state: "missing" | "disabled" | "version" | "inactive";
  /** Installed version, when there is one. */
  installed?: string;
  name?: string;
}
export interface PackageState {
  id: string;
  package: InstalledPackage;
  /** Loaded into the interface: enabled, unchanged, without errors and with all dependencies. */
  active: boolean;
  /** Dependencies that are missing, off, of a wrong version or not loaded themselves. */
  dependencyIssues: DependencyIssue[];
  /** Why something was skipped. */
  warnings: string[];
}
export interface PluginHost {
  packages: PackageState[];
  profiles: Array<{ profile: TagProfile; source: string }>;
  themes: ThemeDef[];
  styles: Array<{ owner: string; css: string }>;
  slots: SlotInfo[];
  patches: OwnedPatch[];
  commands: PluginCommand[];
}
export const emptyHost = (): PluginHost => ({ packages: [], profiles: [], themes: [], styles: [], slots: [], patches: [], commands: [] });

const KNOWN = new Set(PERMISSIONS.map((item) => item.id));
const CHORD = /^(Ctrl\+)?(Alt\+)?(Shift\+)?[A-Za-z0-9]+$/;

/** Dependencies first (all of them are loadable at this point); a cycle only produces a warning. */
function loadOrder(packages: InstalledPackage[], warn: (id: string, text: string) => void): InstalledPackage[] {
  const byId = new Map(packages.map((item) => [item.manifest.id, item])), done = new Set<string>(), visiting = new Set<string>(), order: InstalledPackage[] = [];
  const visit = (item: InstalledPackage) => {
    const id = item.manifest.id;
    if (done.has(id)) return;
    if (visiting.has(id)) { warn(id, "циклическая зависимость между пакетами"); return; }
    visiting.add(id);
    for (const dependency of Object.keys(item.manifest.dependencies ?? {}).sort()) {
      const target = byId.get(dependency);
      if (target) visit(target);
    }
    visiting.delete(id); done.add(id); order.push(item);
  };
  // Themes after plugins, so a theme's interface changes win.
  for (const item of [...packages].sort((a, b) => Number(a.manifest.type === "theme") - Number(b.manifest.type === "theme") || a.manifest.id.localeCompare(b.manifest.id))) visit(item);
  return order;
}

export function buildHost(installed: InstalledPackage[]): PluginHost {
  const host = emptyHost();
  const states = new Map<string, PackageState>();
  for (const item of installed) states.set(item.manifest.id, { id: item.manifest.id, package: item, active: false, dependencyIssues: [], warnings: [] });
  const warn = (id: string, text: string) => states.get(id)?.warnings.push(text);
  const loadable = resolveDependencies(installed, states);
  for (const item of loadOrder(loadable, warn)) {
    const { manifest, files } = item, owner = manifest.id, state = states.get(owner)!;
    state.active = true;
    const granted = new Set(manifest.permissions.filter((permission) => KNOWN.has(permission)));
    const allowed = (permission: string, what: string) => { if (granted.has(permission)) return true; warn(owner, `${what}: нет разрешения «${permission}», пропущено`); return false; };
    const contributes = manifest.contributes ?? {};
    const list = (key: string): unknown[] => Array.isArray(contributes[key]) ? contributes[key] as unknown[] : [];
    const load = (entry: unknown, what: string): unknown => {
      if (typeof entry !== "string") return entry;
      const text = files[entry];
      if (text === undefined) { warn(owner, `${what}: нет файла ${entry}`); return null; }
      try { return JSON.parse(text); } catch { warn(owner, `${what}: ${entry} — неверный JSON`); return null; }
    };
    const css = (path: string, what: string) => { const text = files[path]; if (text === undefined) warn(owner, `${what}: нет файла ${path}`); return text ?? ""; };
    const patches = (raw: unknown[], what: string): OwnedPatch[] => raw.flatMap((entry) => {
      const patch = validatePatch(entry);
      if (!patch) { warn(owner, `${what}: неверное изменение интерфейса ${JSON.stringify(entry).slice(0, 80)}`); return []; }
      if (!allowed(patchPermission(patch), `${what} (${patch.op})`)) return [];
      if (!checkPatch(patch, owner, granted, (text) => warn(owner, `${what}: ${text}`))) return [];
      return [{ ...patch, owner }];
    });

    if (list("profiles").length && allowed("profiles", "Профили форумов")) for (const entry of list("profiles")) {
      const profile = validateProfile(load(entry, "Профиль"));
      if (profile) host.profiles.push({ profile, source: owner }); else warn(owner, "Профиль: неверное описание, пропущен");
    }
    if (list("themes").length && allowed("themes", "Темы")) for (const entry of list("themes")) {
      const { theme, problems, styles, ui } = validateTheme(load(entry, "Тема"), owner);
      problems.forEach((text) => warn(owner, text));
      if (!theme) continue;
      if (styles.length && allowed("styles", `Тема ${theme.id}: CSS`)) theme.css = styles.map((path) => css(path, `Тема ${theme.id}`)).join("\n");
      theme.patches = patches(ui, `Тема ${theme.id}`);
      host.themes.push(theme);
    }
    if (list("styles").length && allowed("styles", "Стили")) for (const entry of list("styles")) if (typeof entry === "string") host.styles.push({ owner, css: css(entry, "Стили") });
    if (list("slots").length && allowed("ui.slots", "Точки расширения")) for (const entry of list("slots")) {
      const slot = entry as { id?: unknown; title?: unknown };
      if (typeof slot?.id !== "string" || !slot.id.startsWith(`${owner}.`)) { warn(owner, `Точка расширения ${String(slot?.id)}: id должен начинаться с «${owner}.»`); continue; }
      host.slots.push({ id: slot.id, title: typeof slot.title === "string" ? slot.title : slot.id, owner });
    }
    if (list("commands").length && allowed("commands", "Команды")) for (const entry of list("commands")) {
      const command = validateCommand(entry, owner, (text) => warn(owner, text));
      if (command && actionAllowed(command.action, granted, (text) => warn(owner, `Команда ${command.id}: ${text}`))) host.commands.push(command);
    }
    host.patches.push(...patches(list("ui"), "Интерфейс"));
  }
  host.packages = [...states.values()];
  return host;
}

/**
 * Packages that can load: enabled, unchanged, without errors, and with every dependency installed,
 * of a matching version and loadable itself. Anything else is reported on the package and skipped.
 */
function resolveDependencies(installed: InstalledPackage[], states: Map<string, PackageState>): InstalledPackage[] {
  const byId = new Map(installed.map((item) => [item.manifest.id, item]));
  let loadable = new Set(installed.filter((item) => item.enabled && !item.tampered && item.errors.length === 0).map((item) => item.manifest.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...loadable]) {
      const issues = dependencyIssues(byId.get(id)!, byId, loadable);
      states.get(id)!.dependencyIssues = issues;
      if (issues.length) { loadable.delete(id); changed = true; }
    }
  }
  // Packages that do not load for other reasons still show their dependency problems.
  for (const item of installed) if (!loadable.has(item.manifest.id)) { const state = states.get(item.manifest.id)!; if (!state.dependencyIssues.length) state.dependencyIssues = dependencyIssues(item, byId, loadable).filter((issue) => issue.state !== "inactive"); }
  return installed.filter((item) => loadable.has(item.manifest.id));
}

export function dependencyIssues(item: InstalledPackage, byId: Map<string, InstalledPackage>, loadable: Set<string>): DependencyIssue[] {
  return Object.entries(item.manifest.dependencies ?? {}).flatMap(([id, requirement]): DependencyIssue[] => {
    const target = byId.get(id);
    if (!target) return [{ id, requirement, state: "missing" }];
    const base = { id, requirement, installed: target.manifest.version, name: target.manifest.name };
    if (!satisfies(target.manifest.version, requirement)) return [{ ...base, state: "version" }];
    if (!target.enabled) return [{ ...base, state: "disabled" }];
    if (!loadable.has(id)) return [{ ...base, state: "inactive" }];
    return [];
  });
}

/** Plugin items carry the owner's id prefix; a select or option bound to a setting needs that permission. */
function checkPatch(patch: UiPatch, owner: string, granted: Set<string>, warn: (text: string) => void): boolean {
  if (patch.op !== "add") return true;
  const item = patch.item;
  if (!item.id.startsWith(`${owner}.`)) { warn(`элемент ${item.id}: id должен начинаться с «${owner}.»`); return false; }
  // Options only offer values; the select that applies them is checked here.
  const binds = item.kind === "select" ? item.bind : undefined;
  if (binds === "profile" && !granted.has("profiles.select")) { warn(`элемент ${item.id}: нет разрешения «profiles.select»`); return false; }
  if (binds === "theme" && !granted.has("themes.select")) { warn(`элемент ${item.id}: нет разрешения «themes.select»`); return false; }
  return true;
}

function validateCommand(raw: unknown, owner: string, warn: (text: string) => void): PluginCommand | null {
  if (!raw || typeof raw !== "object") { warn("Команда: должна быть объектом"); return null; }
  const value = raw as Record<string, unknown>, id = typeof value.id === "string" ? value.id : "";
  if (!id.startsWith(`${owner}.`) || !/^[a-z0-9._-]{1,128}$/i.test(id)) { warn(`Команда ${id || "?"}: id должен начинаться с «${owner}.»`); return null; }
  if (typeof value.title !== "string" || !value.title.trim()) { warn(`Команда ${id}: нет title`); return null; }
  const run = value.run as Record<string, unknown> | undefined;
  let action: PluginAction | null = null;
  if (run && typeof run === "object") {
    if (typeof run.insert === "string") action = { insert: run.insert.slice(0, 20000) };
    else if (typeof run.wrap === "string" && /^[a-z0-9*-]{1,32}$/i.test(run.wrap)) action = { wrap: run.wrap, value: typeof run.value === "string" ? run.value.replace(/[\]\r\n]/g, "").slice(0, 200) : undefined };
    else if (typeof run.command === "string") action = { command: run.command };
    else if (typeof run.setProfile === "string") action = { setProfile: run.setProfile };
    else if (typeof run.setTheme === "string") action = { setTheme: run.setTheme };
  }
  if (!action) { warn(`Команда ${id}: run должен содержать insert, wrap, command, setProfile или setTheme`); return null; }
  const keys = Array.isArray(value.keys) ? value.keys.filter((key): key is string => typeof key === "string" && CHORD.test(key)).slice(0, 3) : [];
  return {
    id, title: value.title.slice(0, 80), category: typeof value.category === "string" ? value.category.slice(0, 40) : "Плагины",
    icon: typeof value.icon === "string" ? value.icon : undefined, hint: typeof value.hint === "string" ? value.hint.slice(0, 200) : undefined, keys, action, owner,
  };
}

function actionAllowed(action: PluginAction, granted: Set<string>, warn: (text: string) => void): boolean {
  const need = "insert" in action || "wrap" in action ? "document.edit" : "setProfile" in action ? "profiles.select" : "setTheme" in action ? "themes.select" : null;
  if (need && !granted.has(need)) { warn(`нет разрешения «${need}», пропущена`); return false; }
  return true;
}
