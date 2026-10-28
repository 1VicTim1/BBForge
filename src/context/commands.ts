export type MenuSurface = "field" | "code" | "builder" | "preview" | "link" | "media";
export interface ContextTarget { surface: MenuSurface; hasSelection: boolean; editable: boolean; hasBlock?: boolean; hasDiagnostic?: boolean }
/**
 * A menu entry: a command, a heading (`kind: "header"`, an explanation that cannot be clicked),
 * a separator, or a submenu (`children`).
 */
export interface ContextCommand { id: string; label: string; shortcut?: string; run(): void; kind?: "header" | "separator"; children?: ContextCommand[] }

const labels: Record<string, string> = {
  undo: "Отменить", redo: "Повторить", cut: "Вырезать", copy: "Копировать", paste: "Вставить", delete: "Удалить", selectAll: "Выделить всё",
  bold: "Жирный", italic: "Курсив", underline: "Подчёркнутый", strike: "Зачёркнутый", spoiler: "Создать спойлер", fix: "Исправить ошибку…",
  copyText: "Копировать видимый текст", copyInner: "Копировать BBCode без внешнего оформления", copyWrapped: "Копировать BBCode с оформлением", copyBlock: "Копировать BBCode блока",
  source: "Перейти к исходному коду", unwrap: "Снять тег", openLink: "Открыть ссылку", copyLink: "Копировать адрес ссылки", copyMedia: "Копировать адрес медиа",
};
const shortcuts: Record<string, string | undefined> = { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z", cut: "Ctrl+X", copy: "Ctrl+C", paste: "Ctrl+V", selectAll: "Ctrl+A", bold: "Ctrl+B", italic: "Ctrl+I", underline: "Ctrl+U" };

export const separator = (id: string): ContextCommand => ({ id, label: "", kind: "separator", run: () => undefined });
export const header = (id: string, label: string): ContextCommand => ({ id, label, kind: "header", run: () => undefined });

/** Groups with separators between the non-empty ones. */
export function grouped(groups: ContextCommand[][]): ContextCommand[] {
  return groups.filter((group) => group.length).flatMap((group, index) => index ? [separator(`separator-${index}`), ...group] : group);
}

/**
 * The menu of a surface, in groups: what `extra` brings (spelling, quick fixes) first, then the
 * clipboard, formatting (in a submenu in the code and the builder), and navigation. Undo and Redo
 * stay in the toolbar and on their keys, except in plain fields.
 */
export function buildContextCommands(target: ContextTarget, handlers: Partial<Record<string, () => void>> = {}, extra: ContextCommand[][] = []): ContextCommand[] {
  const item = (id: string): ContextCommand[] => handlers[id] ? [{ id, label: labels[id], shortcut: shortcuts[id], run: handlers[id]! }] : [];
  const items = (...ids: string[]) => ids.flatMap(item);
  const clipboard = items(...(target.hasSelection ? ["cut", "copy"] : []), "paste", ...(target.hasSelection ? ["delete"] : []));
  const format = (ids: string[]): ContextCommand[] => { const children = items(...ids); return children.length ? [{ id: "format", label: "Формат", run: () => undefined, children }] : []; };
  let groups: ContextCommand[][];
  if (target.surface === "field") groups = [items("undo", "redo"), clipboard, items("selectAll")];
  else if (target.surface === "code") groups = [clipboard, [...format(["bold", "italic", "underline", "strike", "spoiler"]), ...(target.hasDiagnostic ? item("fix") : [])], items("selectAll")];
  else if (target.surface === "builder") groups = [clipboard, [...(target.hasSelection ? format(["bold", "italic", "underline", "strike", "spoiler"]) : []), ...(target.hasBlock ? item("unwrap") : [])], items("selectAll", "source")];
  else if (target.surface === "preview") groups = [items(...(target.hasSelection ? ["copyText", "copyInner", "copyWrapped"] : []), ...(target.hasBlock ? ["copyBlock"] : [])), items("source")];
  else if (target.surface === "link") groups = [items("openLink", "copyLink"), items(...(target.hasSelection ? ["copyText", "copyWrapped"] : [])), items("source")];
  else groups = [items("copyMedia", "copyBlock"), items("source")];
  return grouped([...(target.surface === "code" || target.surface === "builder" ? extra : []), ...groups]);
}

/** Commands that can be run (for tests and keyboard navigation), submenus included. */
export const runnable = (commands: ContextCommand[]): ContextCommand[] => commands.flatMap((command) => command.children ? runnable(command.children) : command.kind ? [] : [command]);
