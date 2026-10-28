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
    <pre className={`convert-output ${options.format === "diff" ? "diff-output" : ""}`} aria-label="Результат">{options.format === "diff"
      ? options.text.split("\n").map((line, index) => <span key={index} className={line.startsWith("+") ? "diff-added" : line.startsWith("-") ? "diff-removed" : line.startsWith("@") ? "diff-hunk" : undefined}>{line}{"\n"}</span>)
      : options.text}</pre>
    <footer>
      <button type="button" onClick={() => onDone(null)}>{options.format === "diff" ? "Закрыть" : "Отмена"}</button>
      <button type="button" onClick={() => onDone("copy")}><Icon name="copy" />Копировать</button>
      {options.format !== "diff" && <button type="button" className="primary" autoFocus onClick={() => onDone("insert")}>{replacing ? "Заменить выделение" : "Вставить в документ"}</button>}
    </footer>
  </section></div>;
}

/** bb.network.allow: a plugin asks to reach an address of its own (a self-hosted server). */
export function ScriptAllowOriginDialog({ plugin, origin, reason, onDone }: { plugin: string; origin: string; reason: string; onDone(allowed: boolean): void }) {
  const local = /^http:\/\//.test(origin);
  return <div className="modal-backdrop"><section className="dialog script-dialog" role="dialog" aria-label="Разрешить доступ к адресу" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onDone(false); } }}>
    <header><h3>Разрешить доступ к адресу?</h3></header>
    <p className="script-origin"><Icon name="puzzle" />{plugin}</p>
    <p>Плагин просит отправлять запросы на <code>{origin}</code>{local ? " (этот компьютер или локальная сеть)" : ""}.</p>
    {reason && <p className="convert-hint">{reason}</p>}
    <p className="convert-hint">Разрешайте только адреса, которым доверяете: плагин сможет отправлять туда данные, которые ему доступны (например, текст документа). Отозвать разрешение можно в настройках плагинов.</p>
    <footer><button type="button" autoFocus onClick={() => onDone(false)}>Запретить</button><button type="button" className="primary" onClick={() => onDone(true)}>Разрешить</button></footer>
  </section></div>;
}
