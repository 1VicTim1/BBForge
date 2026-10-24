import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DocumentSession } from "./session";
import { Icon } from "../components/Icon";

function title(path: string | null): string {
  if (path === null) return "untitled.bbcode";
  return path.split(/[\\/]/).at(-1) || "untitled.bbcode";
}

/** Editor tabs; drag a tab left/right to reorder it (Alt+Shift+←/→ from the keyboard). */
export function TabStrip({ tabs, activeId, onActivate, onClose, onReorder, extra }: {
  tabs: DocumentSession[];
  /** Id of the active document; any other value (the settings tab) leaves every document tab inactive. */
  activeId: string;
  /** Non-document tabs (settings), rendered after the documents. */
  extra?: Array<{ id: string; title: string; icon: Parameters<typeof Icon>[0]["name"]; active: boolean; onActivate(): void; onClose(): void }>;
  onActivate(documentId: string): void;
  onClose(documentId: string): void;
  onReorder(documentId: string, to: number): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; to: number; marker: number } | null>(null);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0 || (event.target as Element).closest(".document-tab-close")) return;
    const startX = event.clientX;
    let active = false, target: { to: number; marker: number } | null = null;
    const others = () => Array.from(host.current?.querySelectorAll<HTMLElement>(".document-tab[data-id]") ?? []).filter((element) => element.dataset.id !== id);
    const move = (next: PointerEvent) => {
      if (!active && Math.abs(next.clientX - startX) < 4) return;
      active = true;
      const rects = others().map((element) => element.getBoundingClientRect()), base = host.current!.getBoundingClientRect();
      const to = rects.filter((rect) => rect.left + rect.width / 2 < next.clientX).length;
      const marker = (to === 0 ? rects[0]?.left ?? base.left : rects[to - 1].right) - base.left + host.current!.scrollLeft;
      target = { to, marker };
      setDrag({ id, ...target });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!active || !target) return;
      const swallow = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
      window.addEventListener("click", swallow, true); setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      if (target.to !== tabs.findIndex((tab) => tab.document.id === id)) onReorder(id, target.to);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  return <div ref={host} className={`document-tabs ${drag ? "reordering" : ""}`} role="tablist" aria-label="Открытые документы">
    {tabs.map((tab, index) => {
      const name = title(tab.document.path);
      const dirty = tab.document.revision !== tab.document.savedRevision;
      return <div className={`document-tab ${tab.document.id === activeId ? "active" : ""} ${dirty ? "dirty" : ""} ${drag?.id === tab.document.id ? "dragging" : ""}`} key={tab.document.id} data-id={tab.document.id} onPointerDown={(event) => startDrag(event, tab.document.id)}>
        <button
          type="button"
          role="tab"
          aria-selected={tab.document.id === activeId}
          aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
          className="document-tab-activate"
          onClick={() => onActivate(tab.document.id)}
          onKeyDown={(event) => {
            if (!event.altKey || !event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
            event.preventDefault();
            const to = index + (event.key === "ArrowLeft" ? -1 : 1);
            if (to >= 0 && to < tabs.length) onReorder(tab.document.id, to);
          }}
        >
          <span className="file-icon" aria-hidden="true" />
          <span className="document-tab-name">{name}</span>
        </button>
        {/* A modified file shows a dot that turns into × on hover. */}
        <button type="button" className="document-tab-close" aria-label={`Закрыть ${name}`} onClick={() => onClose(tab.document.id)}>{dirty && <span className="dirty-dot" aria-label="Есть несохранённые изменения">●</span>}<Icon name="close" /></button>
      </div>;
    })}
    {extra?.map((tab) => <div key={tab.id} className={`document-tab extra-tab ${tab.active ? "active" : ""}`}>
      <button type="button" role="tab" aria-selected={tab.active} className="document-tab-activate" onClick={tab.onActivate}><Icon name={tab.icon} /><span className="document-tab-name">{tab.title}</span></button>
      <button type="button" className="document-tab-close" aria-label={`Закрыть ${tab.title}`} onClick={tab.onClose}><Icon name="close" /></button>
    </div>)}
    {drag && <span className="document-tab-marker" style={{ left: drag.marker }} aria-hidden="true" />}
  </div>;
}
