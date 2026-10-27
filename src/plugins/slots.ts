/**
 * Built-in slots and the ids of their items, as the components draw them. Plugins address items
 * by these ids; the list also tells a move inside a slot from a move into another one.
 * Menu slots ("menu.file", …) are filled from the command registry in App.
 */
export const BUILTIN_SLOTS: Record<string, string[]> = {
  "titlebar.menus": ["menu.file", "menu.edit", "menu.view", "menu.refactor", "menu.tools"],
  "titlebar.actions": [],
  "toolbar.format": [
    "format.undo", "format.redo", "toolbar.format.history-end", "format.bold", "format.italic", "format.underline", "format.strike", "toolbar.format.text-end",
    "format.color", "format.background", "toolbar.format.color-end", "format.link", "format.quote", "format.code", "format.list", "toolbar.format.block-end",
    "format.spoiler", "toolbar.format.spacer", "format.sync",
  ],
  "statusbar.left": ["status.problems", "status.sync"],
  "statusbar.right": ["status.position", "status.endings", "status.encoding", "status.language", "status.profile"],
  "activitybar": ["activity.outline", "activity.search", "activity.blocks", "activity.problems"],
  "activitybar.bottom": ["activity.settings"],
  "sidebar.blocks": ["block.spoiler", "block.quote", "block.code", "block.list", "block.url", "block.img"],
};

export function slotIndex(extra: Record<string, string[]>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [slot, ids] of Object.entries({ ...BUILTIN_SLOTS, ...extra })) for (const id of ids) if (!index.has(id)) index.set(id, slot);
  return index;
}
