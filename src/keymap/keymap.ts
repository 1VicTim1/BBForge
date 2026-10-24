/**
 * Keyboard actions and their shortcuts. Shortcuts are stored by physical key (KeyboardEvent.code) so they
 * keep working in the Russian layout, e.g. "Ctrl+Shift+KeyS".
 */
export type ActionId =
  | "file.new" | "file.open" | "file.save" | "file.saveAs" | "file.close" | "file.closeAll"
  | "tab.next" | "tab.previous"
  | "edit.undo" | "edit.redo" | "edit.find" | "edit.fix" | "edit.fixAll"
  | "format.bold" | "format.italic" | "format.underline" | "format.strike" | "format.link" | "format.quote" | "format.code" | "format.list" | "format.spoiler"
  | "view.code" | "view.split" | "view.builder" | "view.preview" | "view.structure" | "view.problems" | "view.inspector" | "view.search"
  | "refactor.tidyDocument" | "refactor.trimTrailing" | "refactor.removeEmpty" | "refactor.merge" | "refactor.cleanup"
  | "app.settings" | "app.findAction" | "app.commandPalette" | "app.quickOpen" | "app.goToLine";

export interface ActionDefinition { id: ActionId; title: string; category: string; keys: string[] }

export const actionDefinitions: ActionDefinition[] = [
  { id: "file.new", title: "Новый документ", category: "Файл", keys: ["Ctrl+KeyN"] },
  { id: "file.open", title: "Открыть…", category: "Файл", keys: ["Ctrl+KeyO"] },
  { id: "file.save", title: "Сохранить", category: "Файл", keys: ["Ctrl+KeyS"] },
  { id: "file.saveAs", title: "Сохранить как…", category: "Файл", keys: ["Ctrl+Shift+KeyS"] },
  { id: "file.close", title: "Закрыть документ", category: "Файл", keys: ["Ctrl+KeyW", "Ctrl+F4"] },
  { id: "file.closeAll", title: "Закрыть все документы", category: "Файл", keys: ["Ctrl+Shift+KeyW"] },
  { id: "tab.next", title: "Следующая вкладка", category: "Вкладки", keys: ["Ctrl+Tab", "Ctrl+PageDown"] },
  { id: "tab.previous", title: "Предыдущая вкладка", category: "Вкладки", keys: ["Ctrl+Shift+Tab", "Ctrl+PageUp"] },
  { id: "edit.undo", title: "Отменить", category: "Правка", keys: ["Ctrl+KeyZ"] },
  { id: "edit.redo", title: "Повторить", category: "Правка", keys: ["Ctrl+Shift+KeyZ", "Ctrl+KeyY"] },
  { id: "edit.find", title: "Найти в коде", category: "Правка", keys: ["Ctrl+KeyF"] },
  { id: "edit.fix", title: "Показать исправления", category: "Правка", keys: ["Alt+Enter"] },
  { id: "edit.fixAll", title: "Исправить однозначные ошибки", category: "Правка", keys: ["Ctrl+Alt+Enter"] },
  { id: "format.bold", title: "Жирный", category: "Оформление", keys: ["Ctrl+KeyB"] },
  { id: "format.italic", title: "Курсив", category: "Оформление", keys: ["Ctrl+KeyI"] },
  { id: "format.underline", title: "Подчёркнутый", category: "Оформление", keys: ["Ctrl+KeyU"] },
  { id: "format.strike", title: "Зачёркнутый", category: "Оформление", keys: ["Ctrl+Shift+KeyX"] },
  { id: "format.link", title: "Ссылка", category: "Оформление", keys: ["Ctrl+KeyK"] },
  { id: "format.quote", title: "Цитата", category: "Оформление", keys: ["Ctrl+Shift+KeyQ"] },
  { id: "format.code", title: "Блок кода", category: "Оформление", keys: ["Ctrl+Shift+KeyK"] },
  { id: "format.list", title: "Список", category: "Оформление", keys: ["Ctrl+Shift+KeyL"] },
  { id: "format.spoiler", title: "Создать спойлер", category: "Оформление", keys: ["Ctrl+Shift+KeyE"] },
  { id: "view.code", title: "Вид «Код»", category: "Вид", keys: ["Ctrl+Digit1"] },
  { id: "view.builder", title: "Вид «Конструктор»", category: "Вид", keys: ["Ctrl+Digit2"] },
  { id: "view.preview", title: "Вид «Предпросмотр»", category: "Вид", keys: ["Ctrl+Digit3", "Ctrl+Shift+KeyV"] },
  { id: "view.split", title: "Рядом с кодом", category: "Вид", keys: ["Ctrl+Backslash"] },
  { id: "view.structure", title: "Панель «Структура»", category: "Вид", keys: ["Alt+Digit7"] },
  { id: "view.search", title: "Панель «Поиск»", category: "Вид", keys: ["Ctrl+Shift+KeyF"] },
  { id: "view.problems", title: "Панель «Проблемы»", category: "Вид", keys: ["Alt+Digit6"] },
  { id: "view.inspector", title: "Панель «Свойства»", category: "Вид", keys: ["Alt+Digit8"] },
  { id: "refactor.tidyDocument", title: "Убрать пустые строки", category: "Рефакторинг", keys: [] },
  { id: "refactor.trimTrailing", title: "Убрать пробелы в конце строк", category: "Рефакторинг", keys: [] },
  { id: "refactor.removeEmpty", title: "Удалить пустые теги", category: "Рефакторинг", keys: [] },
  { id: "refactor.merge", title: "Склеить соседние одинаковые теги", category: "Рефакторинг", keys: [] },
  { id: "refactor.cleanup", title: "Очистка документа…", category: "Рефакторинг", keys: ["Ctrl+Alt+KeyL"] },
  { id: "app.settings", title: "Настройки", category: "Приложение", keys: ["Ctrl+Alt+KeyS"] },
  { id: "app.commandPalette", title: "Палитра команд", category: "Приложение", keys: ["Ctrl+Shift+KeyP"] },
  { id: "app.findAction", title: "Найти действие", category: "Приложение", keys: ["Ctrl+Shift+KeyA"] },
  { id: "app.quickOpen", title: "Перейти к файлу…", category: "Приложение", keys: ["Ctrl+KeyP"] },
  { id: "app.goToLine", title: "Перейти к строке…", category: "Приложение", keys: [] },
];

export type KeymapOverrides = Partial<Record<ActionId, string[]>>;
const MODIFIERS = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight"]);

export function chordFromEvent(event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string | null {
  if (!event.code || MODIFIERS.has(event.code)) return null;
  return [event.ctrlKey || event.metaKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.code].filter(Boolean).join("+");
}

const names: Record<string, string> = { Enter: "Enter", Tab: "Tab", Escape: "Esc", Space: "Space", Backspace: "Backspace", Delete: "Delete", PageUp: "PgUp", PageDown: "PgDn", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`" };
export function formatChord(chord: string): string {
  return chord.split("+").map((part) => names[part] ?? part.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ")).join("+");
}

export function keysFor(id: ActionId, overrides: KeymapOverrides): string[] {
  return overrides[id] ?? actionDefinitions.find((action) => action.id === id)?.keys ?? [];
}
export function shortcutLabel(id: ActionId, overrides: KeymapOverrides): string | undefined {
  const key = keysFor(id, overrides)[0];
  return key ? formatChord(key) : undefined;
}

export function buildKeymap(overrides: KeymapOverrides): Map<string, ActionId> {
  const map = new Map<string, ActionId>();
  for (const action of actionDefinitions) for (const chord of keysFor(action.id, overrides)) if (!map.has(chord)) map.set(chord, action.id);
  return map;
}

export function validateOverrides(value: unknown): KeymapOverrides {
  if (!value || typeof value !== "object") return {};
  const known = new Set(actionDefinitions.map((action) => action.id)), result: KeymapOverrides = {};
  for (const [id, keys] of Object.entries(value)) if (known.has(id as ActionId) && Array.isArray(keys)) result[id as ActionId] = keys.filter((key): key is string => typeof key === "string" && key.length < 60).slice(0, 4);
  return result;
}
