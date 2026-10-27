import type { IconName } from "../components/Icon";
import type { ActionId } from "../keymap/keymap";

/**
 * One command of the application. Menus, the command palette and keyboard shortcuts are all built
 * from the same list, so a command has one title, one shortcut and one enabled state everywhere.
 */
export interface Command {
  id: string;
  title: string;
  category: string;
  /** A built-in icon name, or `asset:path` inside the plugin package (`owner`). */
  icon?: IconName | string;
  /** Plugin that added the command. */
  owner?: string;
  /** Keymap action that triggers this command; its shortcuts come from the user's keymap. */
  action?: ActionId;
  /** Formatted shortcuts, filled in by `resolveCommands`. */
  keys?: string[];
  /** The "when" condition: false greys the command out. */
  enabled?: boolean;
  hint?: string;
  /** Scoped commands receive the scope picked in the palette (Tab switches it); others ignore it. */
  run(scope?: RefactorScope): void;
  /** How many places the command would change ("12 мест"); null when it cannot tell yet. */
  count?(scope?: RefactorScope): number | null;
  /** Refactorings that can work on the document, the selection or the current spoiler. */
  scoped?: boolean;
  /** Hidden from the palette (e.g. the command that opens the palette). */
  hidden?: boolean;
}

export type RefactorScope = "document" | "selection" | "spoiler";
export const scopeTitles: Record<RefactorScope, string> = { document: "Документ", selection: "Выделение", spoiler: "Текущий спойлер" };

export function resolveCommands(commands: Command[], shortcut: (id: ActionId) => string[]): Command[] {
  return commands.map((command) => command.action ? { ...command, keys: shortcut(command.action) } : command);
}

export function commandById(commands: Command[], id: string): Command | undefined {
  return commands.find((command) => command.id === id);
}

/** Menu layout as command ids; null is a separator. Unknown ids are skipped. */
export function menuItems(commands: Command[], ids: Array<string | null>): Array<Command | null> {
  const items = ids.map((id) => id === null ? null : commandById(commands, id) ?? undefined).filter((item): item is Command | null => item !== undefined);
  return items.filter((item, at) => item !== null || (at > 0 && at < items.length - 1 && items[at - 1] !== null));
}
