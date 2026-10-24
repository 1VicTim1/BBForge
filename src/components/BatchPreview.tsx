import { useMemo, useState } from "react";
import { validateCommand, type EditCommand } from "../document/commands";
import { mergeCommands } from "../document/merge";
import type { DocumentState } from "../document/state";
import { lineDiff } from "../diagnostics/diff";
import { plural } from "../bbcode/tags";
import { Icon } from "./Icon";

export interface BatchItem { id: string; title: string; detail?: string; command: EditCommand }
interface Props { title: string; document: DocumentState; items: BatchItem[]; label: string; onApply(command: EditCommand): void; onClose(): void }

/** Preview of a batch operation: pick changes on the left, see their diff on the right, apply as one Undo step. */
export function BatchPreview({ title, document, items, label, onApply, onClose }: Props) {
  const [checked, setChecked] = useState(() => new Set(items.map((item) => item.id))), [focused, setFocused] = useState(items[0]?.id ?? "");
  const chosen = items.filter((item) => checked.has(item.id));
  const combined = useMemo(() => {
    const { command, skipped } = mergeCommands(document, chosen.map((item) => item.command), label);
    try { if (command) validateCommand(document, command); return { command, skipped, error: "" }; }
    catch (reason) { return { command: null, skipped, error: String(reason) }; }
  }, [document, label, chosen.map((item) => item.id).join("|")]);
  const current = items.find((item) => item.id === focused) ?? items[0];
  let diff: ReturnType<typeof lineDiff> = [];
  try { if (current) diff = lineDiff(document, current.command.changes, 1); } catch { diff = []; }
  const changes = combined.command?.changes.length ?? 0;
  return <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <section className="dialog batch-dialog" role="dialog" aria-label={title}>
      <header><h3>{title}</h3><button className="icon-button" aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button></header>
      <div className="batch-body">
        <div className="batch-list" role="list">
          <label className="batch-all"><input type="checkbox" checked={chosen.length === items.length} ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && chosen.length < items.length; }} onChange={(event) => setChecked(new Set(event.target.checked ? items.map((item) => item.id) : []))} /><span>Все изменения</span><small>{items.length}</small></label>
          {items.map((item) => <label role="listitem" key={item.id} className={`batch-item ${item.id === current?.id ? "active" : ""}`} onMouseEnter={() => setFocused(item.id)} onFocus={() => setFocused(item.id)}>
            <input type="checkbox" checked={checked.has(item.id)} onChange={() => { const next = new Set(checked); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); setChecked(next); setFocused(item.id); }} />
            <span className="batch-item-title">{item.title}{item.detail && <small>{item.detail}</small>}</span>
            <small className="batch-item-count">{plural(item.command.changes.length, ["место", "места", "мест"])}</small>
          </label>)}
        </div>
        <div className="batch-diff mini-diff" aria-label="Изменения">{diff.length ? diff.map((line, index) => <div key={index} className={`diff-line ${line.kind}`}><span className="diff-sign">{line.kind === "removed" ? "−" : line.kind === "added" ? "+" : ""}</span><span className="diff-text">{line.text || (line.kind === "added" ? <em>строка удаляется</em> : " ")}</span></div>) : <p className="panel-empty">Нет изменений для показа</p>}</div>
      </div>
      {(combined.error || combined.skipped > 0) && <p className="batch-error" role="status">{combined.error || `${plural(combined.skipped, ["изменение пересекается", "изменения пересекаются", "изменений пересекаются"])} с другими и будет пропущено — запустите операцию ещё раз после применения`}</p>}
      <footer><span className="batch-summary">{plural(chosen.length, ["операция", "операции", "операций"])} · одна отмена Ctrl+Z</span><span className="spacer" /><button onClick={onClose}>Отмена</button><button className="primary" disabled={!combined.command || !changes} onClick={() => combined.command && onApply(combined.command)}>Применить {plural(changes, ["изменение", "изменения", "изменений"])}</button></footer>
    </section>
  </div>;
}
