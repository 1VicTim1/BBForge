import type { DocumentSession } from "./session";

function title(path: string | null): string {
  if (path === null) return "untitled.bbcode";
  return path.split(/[\\/]/).at(-1) || "untitled.bbcode";
}

export function TabStrip({ tabs, activeId, onActivate, onClose, onReorder }: {
  tabs: DocumentSession[];
  activeId: string;
  onActivate(documentId: string): void;
  onClose(documentId: string): void;
  onReorder(documentId: string, to: number): void;
}) {
  return <div className="document-tabs" role="tablist" aria-label="Открытые документы">
    {tabs.map((tab) => {
      const name = title(tab.document.path);
      const dirty = tab.document.revision !== tab.document.savedRevision;
      return <div className={`document-tab ${tab.document.id === activeId ? "active" : ""}`} key={tab.document.id}>
        <button
          type="button"
          role="tab"
          aria-selected={tab.document.id === activeId}
          className="document-tab-activate"
          onClick={() => onActivate(tab.document.id)}
        >
          <span className="file-icon" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M6.5 4.5h-2v7h2M9.5 4.5h2v7h-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span>{name}</span>
          {dirty && <span className="dirty-dot" aria-label="Есть несохранённые изменения">●</span>}
        </button>
        <button type="button" className="document-tab-move" disabled={tabs.indexOf(tab) === 0} aria-label={`Переместить ${name} влево`} onClick={() => onReorder(tab.document.id, tabs.indexOf(tab) - 1)}>‹</button>
        <button type="button" className="document-tab-move" disabled={tabs.indexOf(tab) === tabs.length - 1} aria-label={`Переместить ${name} вправо`} onClick={() => onReorder(tab.document.id, tabs.indexOf(tab) + 1)}>›</button>
        <button type="button" className="document-tab-close" aria-label={`Закрыть ${name}`} onClick={() => onClose(tab.document.id)}>×</button>
      </div>;
    })}
  </div>;
}
