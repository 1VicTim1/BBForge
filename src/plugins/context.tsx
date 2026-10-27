import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Icon, isIconName } from "../components/Icon";
import { Select } from "../components/Select";
import { resolveSlot, type OwnedPatch, type SlotEntry } from "./ui";

/** What slot views need from the app: the patches in force and how to act on plugin items. */
export interface PluginUi {
  patches: OwnedPatch[];
  /** Runs a command by id (built-in or plugin). */
  runCommand(id: string): void;
  commandTitle(id: string): string | undefined;
  commandEnabled(id: string): boolean;
  /** data: URL of an image inside a package. */
  asset(owner: string | undefined, path: string): string | undefined;
  profiles: Array<{ id: string; name: string }>;
  themes: Array<{ id: string; name: string }>;
  profile: string;
  theme: string;
  setProfile(id: string): void;
  setTheme(id: string): void;
}

const noop = () => undefined;
export const PluginUiContext = createContext<PluginUi>({
  patches: [], runCommand: noop, commandTitle: noop, commandEnabled: () => true, asset: noop,
  profiles: [], themes: [], profile: "", theme: "", setProfile: noop, setTheme: noop,
});
export const usePluginUi = () => useContext(PluginUiContext);

/** The entries of a slot after plugin and theme patches. */
export function useSlot<T>(slot: string, base: Array<{ id: string; value: T }>): SlotEntry<T>[] {
  const { patches } = usePluginUi();
  const key = base.map((item) => item.id).join("|");
  // Built-in values are render callbacks that change every render; the order only depends on ids.
  const order = useMemo(() => resolveSlot(slot, base.map(({ id }) => ({ id, value: id })), patches), [slot, key, patches]);
  const values = new Map(base.map((item) => [item.id, item.value]));
  return order.map((entry) => entry.builtin === undefined ? entry as unknown as SlotEntry<T> : { ...entry, builtin: values.get(entry.builtin)! });
}

/** Attributes every slot item carries so plugin CSS can find it. */
export const uiAttributes = (entry: { id: string; className?: string }, base = "") => ({ "data-ui-id": entry.id, className: [base, entry.className].filter(Boolean).join(" ") || undefined });

export function PluginIcon({ icon, owner }: { icon?: string; owner?: string }) {
  const { asset } = usePluginUi();
  if (!icon) return null;
  if (isIconName(icon)) return <Icon name={icon} />;
  if (icon.startsWith("asset:")) { const source = asset(owner, icon.slice(6)); return source ? <img className="ui-icon plugin-icon" src={source} alt="" aria-hidden="true" /> : null; }
  return null;
}

/**
 * A plugin item (or a built-in command moved into another slot). `variant` picks the look of the
 * place it is drawn in.
 */
export function PluginItemView({ entry, variant }: { entry: SlotEntry<unknown>; variant: "toolbar" | "status" | "activity" | "tile" | "titlebar" }): ReactNode {
  const ui = usePluginUi(), item = entry.item;
  if (!item) return null;
  const title = entry.title ?? item.title ?? (item.command ? ui.commandTitle(item.command) : undefined) ?? item.id;
  const icon = entry.icon ?? item.icon;
  const attributes = uiAttributes({ id: entry.id, className: entry.className }, `plugin-item plugin-${item.kind} plugin-${variant}${variant === "status" ? " status-item" : ""}${variant === "tile" ? " block-tile" : ""}`);
  if (item.kind === "separator") return <span {...attributes} className={[attributes.className, variant === "toolbar" ? "toolbar-divider" : "plugin-separator"].join(" ")} />;
  if (item.kind === "text") return <span {...attributes} title={entry.tooltip ?? item.tooltip}>{title}</span>;
  if (item.kind === "select") return <PluginSelect entry={entry} title={title} />;
  if (item.kind === "button" || item.kind === "command") {
    const command = item.command, disabled = !command || !ui.commandEnabled(command);
    const showTitle = item.showTitle ?? (variant === "tile" || variant === "status" || !icon);
    return <button {...attributes} type="button" aria-label={title} title={entry.tooltip ?? item.tooltip ?? title} disabled={disabled} onClick={() => command && ui.runCommand(command)}>
      {variant === "tile" ? <><span className="tile-icon"><PluginIcon icon={icon} owner={entry.owner} /></span><span><strong>{title}</strong>{(entry.tooltip ?? item.tooltip) && <small>{entry.tooltip ?? item.tooltip}</small>}</span></>
        : <><PluginIcon icon={icon} owner={entry.owner} />{showTitle && <span>{title}</span>}</>}
    </button>;
  }
  return null;
}

function PluginSelect({ entry, title }: { entry: SlotEntry<unknown>; title: string }) {
  const ui = usePluginUi(), item = entry.item!;
  const extra = useSlot(item.itemsSlot ?? `${item.id}.options`, []);
  const builtin = item.source === "profiles" ? ui.profiles : item.source === "themes" ? ui.themes : [];
  const options = [
    ...builtin.map((option) => ({ value: `value:${option.id}`, label: option.name })),
    ...extra.filter((option) => option.item?.kind === "option" && (option.item.value || option.item.command) && !builtin.some((known) => known.id === option.item!.value))
      .map((option) => ({ value: option.item!.value ? `value:${option.item!.value}` : `command:${option.item!.command}`, label: option.title ?? option.item!.title ?? option.id })),
  ];
  const current = item.bind === "profile" ? ui.profile : item.bind === "theme" ? ui.theme : "";
  const choose = (value: string) => {
    if (value.startsWith("command:")) { ui.runCommand(value.slice(8)); return; }
    const id = value.slice(6);
    if (item.bind === "profile") ui.setProfile(id); else if (item.bind === "theme") ui.setTheme(id);
  };
  return <span {...uiAttributes({ id: entry.id, className: entry.className }, "plugin-item plugin-select")} title={entry.tooltip ?? item.tooltip ?? title}>
    <Select label={title} value={current ? `value:${current}` : ""} options={options} onChange={choose} />
  </span>;
}
