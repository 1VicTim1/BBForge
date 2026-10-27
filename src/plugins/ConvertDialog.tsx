import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { convertHtml, type Converter } from "./convert";

/**
 * Paste HTML (or copy a post straight from a forum page: the clipboard's HTML is taken, so the
 * formatting survives), see the BBCode, insert it at the cursor or replace the selection.
 */
export function ConvertDialog({ converter, initial, replacing, onInsert, onCopy, onClose }: { converter: Converter; initial: string; replacing: boolean; onInsert(text: string): void; onCopy(text: string): void; onClose(): void }) {
  const [html, setHtml] = useState(initial), [rich, setRich] = useState(false);
  const result = useMemo(() => {
    if (!html.trim()) return { text: "", error: null as string | null };
    try { return { text: convertHtml(html, converter), error: null }; } catch (reason) { return { text: "", error: String(reason) }; }
  }, [html, converter]);
  const lines = result.text ? result.text.split("\n").length : 0;
  return <div className="modal-backdrop"><section className="dialog convert-dialog" role="dialog" aria-label={converter.title} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><h3>{converter.title}</h3><button className="icon-button" aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button></header>
    {converter.hint && <p className="convert-hint">{converter.hint}</p>}
    <div className="convert-panes">
      <label className="convert-pane"><span className="convert-label">HTML{rich && <small className="convert-badge">вставлено с оформлением</small>}</span>
        <textarea autoFocus aria-label="HTML" spellCheck={false} placeholder="Вставьте сюда шапку со страницы форума или HTML-код" value={html}
          onChange={(event) => { setHtml(event.target.value); setRich(false); }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text/html");
            if (!pasted) return;
            event.preventDefault(); setHtml(pasted); setRich(true);
          }} /></label>
      <div className="convert-pane"><span className="convert-label">BBCode{lines > 0 && <small>{lines} {lines % 10 === 1 && lines % 100 !== 11 ? "строка" : lines % 10 >= 2 && lines % 10 <= 4 && (lines % 100 < 12 || lines % 100 > 14) ? "строки" : "строк"}</small>}</span>
        {result.error ? <div className="package-alert danger" role="alert"><Icon name="error" />{result.error}</div>
          : <pre className="convert-output" aria-label="Результат">{result.text || <span className="muted">Здесь появится BBCode</span>}</pre>}</div>
    </div>
    <footer>
      <button type="button" onClick={onClose}>Отмена</button>
      <button type="button" disabled={!result.text} onClick={() => onCopy(result.text)}><Icon name="copy" />Копировать</button>
      <button type="button" className="primary" disabled={!result.text} onClick={() => onInsert(result.text)}>{replacing ? "Заменить выделение" : "Вставить в документ"}</button>
    </footer>
  </section></div>;
}
