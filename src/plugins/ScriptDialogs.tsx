import { useState } from "react";
import { Icon } from "../components/Icon";
import type { PromptOptions, ReviewOptions } from "./scripts";

/** bb.ui.prompt: one line of input from the user; the plugin's name is always shown. */
export function ScriptPromptDialog({ plugin, options, onDone }: { plugin: string; options: PromptOptions; onDone(value: string | null): void }) {
  const [value, setValue] = useState(options.value ?? "");
  return <div className="modal-backdrop"><form className="dialog script-dialog" role="dialog" aria-label={options.title || plugin} onSubmit={(event) => { event.preventDefault(); onDone(value); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onDone(null); } }}>
    <header><h3>{options.title || "Плагин спрашивает"}</h3></header>
    <p className="script-origin"><Icon name="puzzle" />{plugin}</p>
    {options.hint && <p className="convert-hint">{options.hint}</p>}
    <label className="script-field">{options.label || "Значение"}<input autoFocus value={value} placeholder={options.placeholder} onChange={(event) => setValue(event.target.value)} /></label>
    <footer><button type="button" onClick={() => onDone(null)}>Отмена</button><button type="submit" className="primary" disabled={!value.trim()}>OK</button></footer>
  </form></div>;
}

/** bb.ui.review: text a plugin produced, to insert, copy or drop. */
export function ScriptReviewDialog({ plugin, options, replacing, onDone }: { plugin: string; options: ReviewOptions; replacing: boolean; onDone(choice: "insert" | "copy" | null): void }) {
  const lines = options.text ? options.text.split("\n").length : 0;
  return <div className="modal-backdrop"><section className="dialog script-dialog script-review" role="dialog" aria-label={options.title || plugin} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onDone(null); } }}>
    <header><h3>{options.title || "Результат плагина"}</h3></header>
    <p className="script-origin"><Icon name="puzzle" />{plugin} · {lines} {lines % 10 === 1 && lines % 100 !== 11 ? "строка" : lines % 10 >= 2 && lines % 10 <= 4 && (lines % 100 < 12 || lines % 100 > 14) ? "строки" : "строк"}</p>
    {options.hint && <p className="convert-hint">{options.hint}</p>}
    <pre className="convert-output" aria-label="Результат">{options.text}</pre>
    <footer>
      <button type="button" onClick={() => onDone(null)}>Отмена</button>
      <button type="button" onClick={() => onDone("copy")}><Icon name="copy" />Копировать</button>
      <button type="button" className="primary" autoFocus onClick={() => onDone("insert")}>{replacing ? "Заменить выделение" : "Вставить в документ"}</button>
    </footer>
  </section></div>;
}
