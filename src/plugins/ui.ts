/**
 * Extensible interface: every place plugins may change is a slot — an ordered list of items with
 * stable ids (`toolbar.format` holds `format.bold`, `format.italic`, …). Plugins and themes send
 * patches: add their own items, remove, move or update (rename, re-icon, restyle) existing ones.
 * Every rendered item carries `data-ui-id`, so plugin CSS can target it.
 */

export type UiItemKind = "button" | "select" | "separator" | "text" | "menu" | "command" | "option";
export interface UiItem {
  id: string;
  kind: UiItemKind;
  title?: string;
  /** A built-in icon name or `asset:path/in/package.svg`. */
  icon?: string;
  tooltip?: string;
  /** Command run by a button, menu entry or option. */
  command?: string;
  /** select: what the selection controls. */
  bind?: "profile" | "theme";
  /** select: built-in options to list. */
  source?: "profiles" | "themes";
  /** select or menu: a slot whose items (options or commands) other plugins may add. */
  itemsSlot?: string;
  /** option: the profile or theme id it selects. */
  value?: string;
  className?: string;
  /** button: show the title next to the icon. */
  showTitle?: boolean;
}

export interface ItemOverrides { title?: string; icon?: string; tooltip?: string; className?: string }
export type UiPatch =
  | { op: "add"; slot: string; item: UiItem; before?: string; after?: string }
  | { op: "remove"; target: string; slot?: string }
  | { op: "move"; target: string; slot?: string; before?: string; after?: string }
  | { op: "update"; target: string; slot?: string; set: ItemOverrides & { hidden?: boolean } };
/** A patch with the package that sent it (for error messages and asset lookup). */
export type OwnedPatch = UiPatch & { owner: string };

export interface SlotEntry<T> extends ItemOverrides {
  id: string;
  /** The built-in thing this entry stands for; absent for plugin items. */
  builtin?: T;
  item?: UiItem;
  owner?: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SAFE_CLASS = /^[a-z0-9 _-]{0,120}$/i;
const string = (value: unknown, max = 120) => typeof value === "string" ? value.slice(0, max) : undefined;

export function validateItem(raw: unknown): UiItem | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = string(value.id), kind = value.kind as UiItemKind;
  if (!id || !SAFE_ID.test(id) || !["button", "select", "separator", "text", "menu", "command", "option"].includes(kind)) return null;
  const item: UiItem = { id, kind };
  for (const key of ["title", "icon", "tooltip", "command", "value"] as const) { const field = string(value[key]); if (field !== undefined) item[key] = field; }
  const itemsSlot = string(value.itemsSlot); if (itemsSlot && SAFE_ID.test(itemsSlot)) item.itemsSlot = itemsSlot;
  if (value.bind === "profile" || value.bind === "theme") item.bind = value.bind;
  if (value.source === "profiles" || value.source === "themes") item.source = value.source;
  const className = string(value.className); if (className && SAFE_CLASS.test(className)) item.className = className;
  if (typeof value.showTitle === "boolean") item.showTitle = value.showTitle;
  return item;
}

export function validatePatch(raw: unknown): UiPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const anchor = (key: "before" | "after") => { const field = string(value[key]); return field && SAFE_ID.test(field) ? field : undefined; };
  const slot = string(value.slot), target = string(value.target);
  if (slot !== undefined && !SAFE_ID.test(slot)) return null;
  if (value.op === "add") {
    const item = validateItem(value.item);
    return item && slot ? { op: "add", slot, item, before: anchor("before"), after: anchor("after") } : null;
  }
  if (!target || !SAFE_ID.test(target)) return null;
  if (value.op === "remove") return { op: "remove", target, slot };
  if (value.op === "move") return { op: "move", target, slot, before: anchor("before"), after: anchor("after") };
  if (value.op === "update" && value.set && typeof value.set === "object") {
    const set = value.set as Record<string, unknown>, result: ItemOverrides & { hidden?: boolean } = {};
    for (const key of ["title", "icon", "tooltip"] as const) { const field = string(set[key]); if (field !== undefined) result[key] = field; }
    const className = string(set.className); if (className !== undefined && SAFE_CLASS.test(className)) result.className = className;
    if (typeof set.hidden === "boolean") result.hidden = set.hidden;
    return { op: "update", target, slot, set: result };
  }
  return null;
}

/** The permission a patch needs. */
export const patchPermission = (patch: UiPatch) => patch.op === "add" ? "ui.add" : patch.op === "remove" ? "ui.remove" : "ui.modify";

function place<T>(entries: SlotEntry<T>[], entry: SlotEntry<T>, before?: string, after?: string) {
  const anchor = before ?? after, at = anchor ? entries.findIndex((item) => item.id === anchor) : -1;
  if (at < 0) entries.push(entry); else entries.splice(before ? at : at + 1, 0, entry);
}

/**
 * Moves across slots become "remove here, add there". A built-in entry can only leave its slot
 * when it is a command (`commandIds`), since only commands can be drawn anywhere.
 */
export function normalizePatches(patches: OwnedPatch[], slotOf: (id: string) => string | undefined, commandIds: Set<string>): OwnedPatch[] {
  const result: OwnedPatch[] = [];
  for (const patch of patches) {
    if (patch.op !== "move" || !patch.slot) { result.push(patch); continue; }
    const added = [...result].reverse().find((item): item is Extract<OwnedPatch, { op: "add" }> => item.op === "add" && item.item.id === patch.target);
    const home = added?.slot ?? slotOf(patch.target);
    if (home === patch.slot) { result.push(patch); continue; }
    if (added) { result.push({ op: "remove", target: patch.target, owner: patch.owner }, { op: "add", slot: patch.slot, item: added.item, before: patch.before, after: patch.after, owner: added.owner }); continue; }
    if (commandIds.has(patch.target)) result.push({ op: "remove", target: patch.target, owner: patch.owner }, { op: "add", slot: patch.slot, item: { id: patch.target, kind: "command", command: patch.target }, before: patch.before, after: patch.after, owner: patch.owner });
  }
  return result;
}

/** Applies the patches to one slot. Hidden entries are dropped. */
export function resolveSlot<T>(slot: string, base: Array<{ id: string; value: T }>, patches: OwnedPatch[]): SlotEntry<T>[] {
  const entries: SlotEntry<T>[] = base.map(({ id, value }) => ({ id, builtin: value }));
  const hidden = new Set<string>();
  const inSlot = (patch: { slot?: string }) => !patch.slot || patch.slot === slot;
  for (const patch of patches) {
    if (patch.op === "add") {
      if (patch.slot !== slot || entries.some((entry) => entry.id === patch.item.id)) continue;
      place(entries, { id: patch.item.id, item: patch.item, owner: patch.owner, className: patch.item.className }, patch.before, patch.after);
      continue;
    }
    const at = entries.findIndex((entry) => entry.id === patch.target);
    if (at < 0 || !inSlot(patch)) continue;
    if (patch.op === "remove") entries.splice(at, 1);
    else if (patch.op === "move") { const [entry] = entries.splice(at, 1); place(entries, entry, patch.before, patch.after); }
    else {
      const { hidden: hide, className, ...rest } = patch.set, entry = entries[at];
      Object.assign(entry, rest);
      if (className !== undefined) entry.className = [entry.className, className].filter(Boolean).join(" ");
      if (hide === true) hidden.add(entry.id); else if (hide === false) hidden.delete(entry.id);
    }
  }
  return entries.filter((entry) => !hidden.has(entry.id));
}
