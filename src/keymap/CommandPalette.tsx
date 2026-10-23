import { useMemo, useState } from "react";
import { actionDefinitions, formatChord, keysFor, type ActionId, type KeymapOverrides } from "./keymap";

/** "Find Action" (Ctrl+Shift+A): type part of an action name, Enter runs it. */
export function CommandPalette({ keymap, onRun, onClose }: { keymap: KeymapOverrides; onRun(id: ActionId): void; onClose(): void }) {
  const [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const found = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return actionDefinitions.filter((action) => action.id !== "app.findAction" && words.every((word) => `${action.title} ${action.category}`.toLowerCase().includes(word)));
  }, [query]);
  const current = Math.min(active, Math.max(0, found.length - 1));
  return <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="palette" role="dialog" aria-label="Найти действие">
      <input autoFocus aria-label="Название действия" placeholder="Введите название действия…" value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onClose(); }
          else if (event.key === "ArrowDown") { event.preventDefault(); setActive((current + 1) % Math.max(1, found.length)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current - 1 + found.length) % Math.max(1, found.length)); }
          else if (event.key === "Enter" && found[current]) { event.preventDefault(); onRun(found[current].id); }
        }} />
      <div className="palette-list" role="listbox">
        {found.map((action, index) => <button key={action.id} role="option" aria-selected={index === current} className={index === current ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => onRun(action.id)}>
          <span>{action.title}</span><small>{action.category}</small>{keysFor(action.id, keymap)[0] && <kbd>{formatChord(keysFor(action.id, keymap)[0])}</kbd>}
        </button>)}
        {found.length === 0 && <p>Ничего не найдено</p>}
      </div>
    </section>
  </div>;
}
