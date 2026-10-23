import { useEffect, useState } from "react";
import { actionDefinitions, chordFromEvent, formatChord, keysFor, type ActionId, type KeymapOverrides } from "./keymap";

/** Settings page: every action with its shortcuts; click "+" and press keys to assign, conflicts are moved. */
export function KeymapEditor({ value, onChange, onRecording }: { value: KeymapOverrides; onChange(value: KeymapOverrides): void; onRecording?(active: boolean): void }) {
  const [recording, setRecording] = useState<ActionId | null>(null), [filter, setFilter] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    onRecording?.(recording !== null);
    if (!recording) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey) { setRecording(null); return; }
      const chord = chordFromEvent(event);
      if (!chord) return;
      if (!/^(Ctrl|Alt)\+/.test(chord) && !/^F\d+$/.test(event.code)) { setNotice("Используйте Ctrl или Alt (или F1–F12)"); return; }
      const next: KeymapOverrides = { ...value };
      const owner = actionDefinitions.find((action) => action.id !== recording && keysFor(action.id, next).includes(chord));
      if (owner) { next[owner.id] = keysFor(owner.id, next).filter((key) => key !== chord); setNotice(`Сочетание ${formatChord(chord)} снято с «${owner.title}»`); } else setNotice("");
      next[recording] = [...keysFor(recording, next).filter((key) => key !== chord), chord];
      onChange(next); setRecording(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => { window.removeEventListener("keydown", capture, true); onRecording?.(false); };
  }, [recording, value]);
  const shown = actionDefinitions.filter((action) => `${action.title} ${action.category} ${keysFor(action.id, value).map(formatChord).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  const categories = [...new Set(shown.map((action) => action.category))];
  return <div className="keymap-editor">
    <input aria-label="Поиск действия" placeholder="Поиск по названию или сочетанию…" value={filter} onChange={(event) => setFilter(event.target.value)} />
    {notice && <p className="keymap-notice" role="status">{notice}</p>}
    <div className="keymap-list">
      {categories.map((category) => <section key={category}><h5>{category}</h5>
        {shown.filter((action) => action.category === category).map((action) => {
          const keys = keysFor(action.id, value), changed = value[action.id] !== undefined;
          return <div className="keymap-row" key={action.id}>
            <span className={changed ? "keymap-title changed" : "keymap-title"}>{action.title}</span>
            <span className="keymap-keys">
              {keys.length === 0 && recording !== action.id && <span className="keymap-empty">не назначено</span>}
              {keys.map((key) => <span className="keymap-chip" key={key}><kbd>{formatChord(key)}</kbd><button aria-label={`Убрать ${formatChord(key)} у «${action.title}»`} onClick={() => onChange({ ...value, [action.id]: keys.filter((item) => item !== key) })}>×</button></span>)}
              {recording === action.id ? <span className="keymap-recording">Нажмите сочетание… (Esc — отмена)</span>
                : <button className="keymap-add" aria-label={`Добавить сочетание для «${action.title}»`} onClick={() => { setNotice(""); setRecording(action.id); }}>+</button>}
              {changed && <button className="keymap-reset" title="Вернуть сочетания по умолчанию" onClick={() => { const next = { ...value }; delete next[action.id]; onChange(next); }}>Сбросить</button>}
            </span>
          </div>;
        })}
      </section>)}
    </div>
  </div>;
}
