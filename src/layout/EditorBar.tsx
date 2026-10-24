import { Icon } from "../components/Icon";
import { tagRole } from "../bbcode/tags";

export type EditorView = "code" | "builder" | "preview";
export interface Crumb { tag: string; label: string; onClick(): void }
interface Props {
  crumbs: Crumb[];
  view: EditorView;
  split: boolean;
  onView(view: EditorView): void;
  onSplit(): void;
  keys: Partial<Record<EditorView | "split", string>>;
}
const views: Array<[EditorView, string]> = [["code", "Код"], ["builder", "Конструктор"], ["preview", "Предпросмотр"]];

/** Breadcrumbs of the block at the cursor, the view switch and the "side by side" toggle. */
export function EditorBar({ crumbs, view, split, onView, onSplit, keys }: Props) {
  return <div className="editor-bar">
    <nav className="breadcrumbs" aria-label="Путь к блоку">
      <span className="crumb-root">Шапка</span>
      {crumbs.map((crumb, index) => <span className="crumb" key={index}><Icon name="chevronRight" className="ui-icon crumb-separator" />
        <button onClick={crumb.onClick} title={`Перейти к [${crumb.tag}]`}><span className={`tag-name role-${tagRole(crumb.tag)}`}>{crumb.tag}</span>{crumb.label && <span className="crumb-label">«{crumb.label}»</span>}</button>
      </span>)}
    </nav>
    <div className="segmented mode-tabs" role="group" aria-label="Режим редактора">
      {views.map(([value, title]) => <button key={value} aria-pressed={view === value} className={view === value ? "active" : ""} title={keys[value] ? `${title} (${keys[value]})` : title} onClick={() => onView(value)}>{title}</button>)}
    </div>
    <button className={`split-toggle ${split ? "active" : ""}`} aria-label="Рядом" aria-pressed={split} title={keys.split ? `Рядом: код и ${view === "preview" ? "предпросмотр" : "конструктор"} (${keys.split})` : "Рядом"} onClick={onSplit}><Icon name="columns" /><span className="split-label">Рядом</span></button>
  </div>;
}
