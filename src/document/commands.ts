import type { DocumentState, TextChange } from "./state";
export interface DocumentIdentity { documentId: string; revision: number }
export interface SourceRange { from: number; to: number }
export interface EditCommand extends DocumentIdentity { changes: TextChange[]; selection?: SourceRange; label: string }
export function identity(document: DocumentState): DocumentIdentity { return { documentId: document.id, revision: document.revision }; }
export function validateCommand(document: DocumentState, command: EditCommand): void {
  if (document.id !== command.documentId || document.revision !== command.revision) throw new Error("Документ изменился. Повторите действие после обновления структуры.");
  let previousEnd = -1;
  for (const change of [...command.changes].sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (!Number.isInteger(change.from) || !Number.isInteger(change.to) || change.from < 0 || change.to < change.from || change.to > document.text.length || change.from < previousEnd) throw new Error("Пересекающиеся или неверные диапазоны изменений");
    for (const offset of [change.from, change.to]) if (offset > 0 && offset < document.text.length && /[\uDC00-\uDFFF]/.test(document.text[offset]) && /[\uD800-\uDBFF]/.test(document.text[offset - 1])) throw new Error("Изменение разрезает символ Unicode");
    if (change.endings && change.endings.length !== (change.insert.match(/\n/g)?.length ?? 0)) throw new Error("Неверная карта переводов строк");
    previousEnd = change.to;
  }
}
