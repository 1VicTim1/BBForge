import type { ReactNode } from "react";
import { Splitter } from "./Splitter";
import { Icon } from "../components/Icon";
import type { LayoutSettings } from "./settings";
import type { EditorView } from "./EditorBar";

interface Props {
  layout: LayoutSettings; setLayout(value: LayoutSettings): void;
  view: EditorView; split: boolean;
  sidebar: { title: string; content: ReactNode; actions?: ReactNode } | null;
  tabs: ReactNode; editorBar: ReactNode; toolbar: ReactNode;
  editor: ReactNode; builder: ReactNode; preview: ReactNode;
  /** Replaces the document views while the settings tab is active. */
  page?: ReactNode;
  problems: ReactNode | null;
  inspector: ReactNode | null;
}

/** Islands on the canvas: sidebar, the editor with the problems panel under it, and the inspector. */
export function Workspace({ layout, setLayout, view, split, sidebar, tabs, editorBar, toolbar, editor, builder, preview, page, problems, inspector }: Props) {
  const showCode = !page && (split || view === "code"), visual = view === "preview" ? "preview" : "builder", showVisual = !page && (split || view !== "code");
  return <section className="ide-workspace">
    {sidebar && <><aside className="island sidebar panel outline" style={{ width: layout.outlineWidth }} aria-label={sidebar.title}>
      <div className="tool-heading"><h2>{sidebar.title}</h2>{sidebar.actions}<button className="icon-button panel-close" aria-label={`Закрыть ${sidebar.title === "Структура" ? "структуру" : sidebar.title.toLowerCase()}`} onClick={() => setLayout({ ...layout, showOutline: false })}><Icon name="close" /></button></div>
      {sidebar.content}
    </aside><Splitter value={layout.outlineWidth} resetValue={256} min={200} max={480} label="Ширина структуры" onChange={(outlineWidth) => setLayout({ ...layout, outlineWidth })} /></>}
    <div className="center-column">
      <section className="island editor-island document-area">
        {tabs}
        {page ?? <>{editorBar}{toolbar}</>}
        <div className={`editing-area view-${view} ${split ? "split" : ""}`} hidden={!!page}>
          <section className="code-pane" style={{ display: showCode ? "flex" : "none", flexBasis: split ? `${layout.splitRatio * 100}%` : "100%" }} aria-label="Исходный код">{editor}</section>
          {showCode && showVisual && <Splitter ratio value={layout.splitRatio} resetValue={.5} min={.25} max={.75} label={visual === "preview" ? "Соотношение кода и предпросмотра" : "Соотношение кода и конструктора"} onChange={(splitRatio) => setLayout({ ...layout, splitRatio })} />}
          {showVisual && visual === "builder" && <section className="builder-pane" aria-label="Конструктор">{builder}</section>}
          {showVisual && visual === "preview" && <section className="preview-pane preview" aria-label="Предпросмотр">{preview}</section>}
        </div>
      </section>
      {problems && <><Splitter orientation="horizontal" value={layout.problemsHeight} min={100} max={400} label="Высота панели проблем" onChange={(problemsHeight) => setLayout({ ...layout, problemsHeight })} /><div className="problems-slot" style={{ height: layout.problemsHeight }}>{problems}</div></>}
    </div>
    {inspector && <><Splitter value={layout.inspectorWidth} resetValue={264} min={220} max={420} invert label="Ширина инспектора" onChange={(inspectorWidth) => setLayout({ ...layout, inspectorWidth })} /><aside className="island inspector" style={{ width: layout.inspectorWidth }} aria-label="Свойства">{inspector}</aside></>}
  </section>;
}
