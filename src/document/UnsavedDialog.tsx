import { Icon } from "../components/Icon";
import type { UnsavedChoice } from "./lifecycle";

/** One question for every unsaved document: save them all, drop the changes, or stay. */
export function UnsavedDialog({ names, onDone }: { names: string[]; onDone(choice: UnsavedChoice): void }) {
  const many = names.length > 1;
  return <div className="modal-backdrop"><section className="dialog unsaved-dialog" role="dialog" aria-label="Несохранённые изменения" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onDone("cancel"); } }}>
    <header><h3>{many ? `Сохранить изменения в ${names.length} документах?` : `Сохранить изменения в «${names[0]}»?`}</h3></header>
    {many && <ul className="unsaved-list">{names.map((name, index) => <li key={index}><Icon name="file" />{name}</li>)}</ul>}
    <p className="convert-hint">Если не сохранить, изменения пропадут.</p>
    <footer>
      <button type="button" onClick={() => onDone("cancel")}>Отмена</button>
      <button type="button" className="danger-action" onClick={() => onDone("discard")}>Не сохранять</button>
      <button type="button" className="primary" autoFocus onClick={() => onDone("save")}>{many ? "Сохранить все" : "Сохранить"}</button>
    </footer>
  </section></div>;
}
