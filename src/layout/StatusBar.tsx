import type { DocumentState } from "../document/state";

interface Props {
  document: DocumentState; position: number;
  errors: number; warnings: number; synced: boolean;
  /** Drag-and-drop hint ("Переместить внутрь «…», после «…»"), shown instead of the sync state. */
  hint?: string | null;
  onProblems(): void; onGoToLine(): void;
}

export function StatusBar({ document, position, errors, warnings, synced, hint, onProblems, onGoToLine }: Props) {
  const prefix = document.text.slice(0, position), line = (prefix.match(/\n/g)?.length ?? 0) + 1, column = Array.from(prefix.slice(prefix.lastIndexOf("\n") + 1)).length + 1;
  const kinds = new Set(document.endings), endings = kinds.size > 1 ? "LF / CRLF" : document.endings[0] === "crlf" ? "CRLF" : "LF";
  return <footer className="statusbar">
    <button className="status-item status-counts" title="Показать проблемы" aria-label={`Ошибки: ${errors}, предупреждения: ${warnings}`} onClick={onProblems}>
      <span className="status-count"><span className="severity-dot error" />{errors}</span><span className="status-count"><span className="severity-dot warning" />{warnings}</span>
    </button>
    {hint ? <span className="status-item status-hint" role="status">{hint}</span>
      : <span className={`status-item ${synced ? "status-ok" : "status-pending"}`} role="status">{synced ? "Синхронизировано" : "Синхронизация…"}</span>}
    <span className="spacer" />
    <button className="status-item" title="Перейти к строке" onClick={onGoToLine}>Стр {line}, Ст {column}</button>
    <span className="status-item" title="Переводы строк">{endings}</span>
    <span className="status-item" title="Кодировка">UTF-8{document.bom ? " BOM" : ""}</span>
    <span className="status-item" title="Язык документа">BBCode</span>
    <span className="status-item profile-badge" title="Профиль разметки: форум 4PDA">4PDA</span>
  </footer>;
}
