export type MenuSurface = "field" | "code" | "builder" | "preview" | "link" | "media";
export interface ContextTarget { surface: MenuSurface; hasSelection: boolean; editable: boolean; hasBlock?: boolean; hasDiagnostic?: boolean }
export interface ContextCommand { id: string; label: string; shortcut?: string; run(): void }

const labels: Record<string, string> = {
  undo: "Отменить", redo: "Повторить", cut: "Вырезать", copy: "Копировать", paste: "Вставить", delete: "Удалить", selectAll: "Выделить всё",
  bold: "Жирный", italic: "Курсив", underline: "Подчёркнутый", strike: "Зачёркнутый", spoiler: "Создать спойлер", fix: "Исправить ошибку…",
  copyText: "Копировать видимый текст", copyInner: "Копировать BBCode без внешнего оформления", copyWrapped: "Копировать BBCode с оформлением", copyBlock: "Копировать BBCode блока",
  source: "Перейти к исходному коду", unwrap: "Снять тег", openLink: "Открыть ссылку", copyLink: "Копировать адрес ссылки", copyMedia: "Копировать адрес медиа",
};

export function buildContextCommands(target: ContextTarget, handlers: Partial<Record<string, () => void>> = {}, fixes: ContextCommand[] = []): ContextCommand[] {
  let ids: string[];
  if (target.surface === "field") ids = ["undo", "redo", ...(target.hasSelection ? ["cut", "copy", "delete"] : []), "paste", "selectAll"];
  else if (target.surface === "code") ids = ["undo", "redo", ...(target.hasSelection ? ["cut", "copy", "delete"] : []), "paste", "selectAll", "bold", "italic", "underline", "strike", "spoiler", ...(target.hasDiagnostic ? ["fix"] : [])];
  else if (target.surface === "builder") ids = ["undo", "redo", ...(target.hasSelection ? ["cut", "copy", "delete", "bold", "italic", "underline", "strike", "spoiler"] : []), "paste", "selectAll", ...(target.hasBlock ? ["unwrap"] : []), "source"];
  else if (target.surface === "preview") ids = [...(target.hasSelection ? ["copyText", "copyInner", "copyWrapped"] : []), ...(target.hasBlock ? ["copyBlock"] : []), "source"];
  else if (target.surface === "link") ids = ["openLink", "copyLink", ...(target.hasSelection ? ["copyText", "copyWrapped"] : []), "source"];
  else ids = ["copyMedia", "copyBlock", "source"];
  const built = ids.filter((id) => handlers[id]).map((id) => ({ id, label: labels[id], shortcut: shortcuts[id], run: handlers[id]! }));
  return fixes.length && (target.surface === "code" || target.surface === "builder") ? [...fixes, ...built] : built;
}

const shortcuts: Record<string, string | undefined> = { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z", cut: "Ctrl+X", copy: "Ctrl+C", paste: "Ctrl+V", selectAll: "Ctrl+A", bold: "Ctrl+B", italic: "Ctrl+I", underline: "Ctrl+U" };
