import { useState } from "react";
import type { DocumentState } from "../document/state";
import { applyChanges } from "../document/state";
import type { EditCommand } from "../document/commands";
import { validateCommand } from "../document/commands";
import type { FixSuggestion } from "../diagnostics/fixes";
import { safeExternalUrl } from "./Preview";
export function ChangePreview({ document, suggestion: initial, options, onApply, onClose }: { document: DocumentState; suggestion: FixSuggestion; options?: FixSuggestion[]; onApply(command: EditCommand): void; onClose(): void }) {
  const [parameter, setParameter] = useState(""), [error, setError] = useState(""), [chosen, setChosen] = useState(initial.id);
  const suggestion = options?.find((item) => item.id === chosen) ?? initial;
  const command = { ...suggestion.command, changes: suggestion.command.changes.map((change) => ({ ...change, insert: suggestion.needsParameter ? change.insert.replace("$VALUE", () => parameter) : change.insert })) };
  let next = document.text, stale = false;
  try { validateCommand(document, command); next = applyChanges(document, command.changes).text; } catch { stale = true; }
  const low = Math.min(...command.changes.map((item) => item.from)), high = Math.max(...command.changes.map((item) => item.to));
  const start = document.text.lastIndexOf("\n", Math.max(0, low - 1)) + 1;
  const end = document.text.indexOf("\n", high);
  const before = document.text.slice(start, end < 0 ? undefined : end);
  const delta = next.length - document.text.length;
  const after = next.slice(start, end < 0 ? undefined : end + delta);
  return <div className="modal-backdrop"><section className="dialog diff-dialog" role="dialog" aria-label="Предпросмотр исправления"><header><h3>{options && options.length > 1 ? "Выберите исправление" : suggestion.title}</h3><button aria-label="Закрыть предпросмотр исправления" onClick={onClose}>×</button></header>
    {options && options.length > 1 && <div className="fix-options" role="radiogroup" aria-label="Варианты исправления">{options.map((item) => <label key={item.id} className="fix-option"><input type="radio" name="fix-option" checked={item.id === suggestion.id} onChange={() => { setChosen(item.id); setError(""); }} /> <span>{item.title}</span>{item.impact && <small className={`fix-impact ${item.impact.startsWith("добавит") ? "worse" : item.impact.startsWith("устраняет") ? "better" : ""}`}>{item.impact}</small>}</label>)}</div>}
    {!(options && options.length > 1) && suggestion.impact && <p className={`fix-impact ${suggestion.impact.startsWith("добавит") ? "worse" : suggestion.impact.startsWith("устраняет") ? "better" : ""}`}>{suggestion.impact}</p>}
    {suggestion.needsParameter && <label>Значение параметра <input aria-label="Значение параметра" value={parameter} onChange={(event) => setParameter(event.target.value)} /></label>}
    <div className="diff-grid"><section><h4>До</h4><pre className="diff-before">{before || "∅"}</pre></section><section><h4>После</h4><pre className="diff-after">{after || "∅"}</pre></section></div>
    {(stale || error) && <p role="alert">{stale ? "Документ изменился. Откройте исправление заново." : error}</p>}
    <footer><button onClick={onClose}>Отмена</button><button className="primary" disabled={stale || !!suggestion.needsParameter && !parameter.trim()} onClick={() => {
      if (suggestion.needsParameter && /[\]\r\n]/.test(parameter)) { setError("Параметр содержит недопустимые символы"); return; }
      if (suggestion.needsParameter === "url" && !safeExternalUrl(parameter)) { setError("Введите http, https или mailto ссылку"); return; }
      if (suggestion.needsParameter === "color" && !/^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(parameter)) { setError("Некорректный цвет"); return; }
      if (suggestion.needsParameter === "size" && !/^\d{1,2}$/.test(parameter)) { setError("Размер — целое число от 1 до 99"); return; }
      if (suggestion.needsParameter === "font" && !/^[\w -]{1,40}$/.test(parameter)) { setError("Некорректное название шрифта"); return; }
      onApply(command);
    }}>Применить исправление</button></footer>
  </section></div>;
}
