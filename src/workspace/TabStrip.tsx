import type { DocumentSession } from "./session";

function title(path: string | null): string {
  if (path === null) return "untitled.bbcode";
  return path.split(/[\\/]/).at(-1) || "untitled.bbcode";
}

export function TabStrip({ tabs, activeId, onActivate, onClose }: {
  tabs: DocumentSession[];
  activeId: string;
  onActivate(documentId: string): void;
  onClose(documentId: string): void;
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
          <span className="file-icon">[ ]</span>
          <span>{name}</span>
          {dirty && <span className="dirty-dot" aria-label="Есть несохранённые изменения">●</span>}
        </button>
        <button type="button" className="document-tab-close" aria-label={`Закрыть ${name}`} onClick={() => onClose(tab.document.id)}>×</button>
      </div>;
    })}
  </div>;
}
