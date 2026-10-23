import type { ReactNode } from "react";
import { Splitter } from "./Splitter";
import { Icon } from "../components/Icon";
import type { LayoutSettings } from "./settings";
export function Workspace({ layout, setLayout, outline, editor, builder, preview, showPreview, onClosePreview, properties }: { layout: LayoutSettings; setLayout(value: LayoutSettings): void; outline: ReactNode; editor: ReactNode; builder: ReactNode; preview: ReactNode; showPreview: boolean; onClosePreview(): void; properties: ReactNode }) {
  return <section className="ide-workspace">
    {layout.showOutline && <><aside className="panel outline" style={{ width: layout.outlineWidth }}><div className="tool-heading"><h2>Структура</h2><span>BBCode</span><button className="panel-close" aria-label="Закрыть структуру" title="Закрыть панель структуры" onClick={() => setLayout({ ...layout, showOutline: false })}>×</button></div>{outline}</aside><Splitter value={layout.outlineWidth} resetValue={232} min={180} max={480} label="Ширина структуры" onChange={(outlineWidth) => setLayout({ ...layout, outlineWidth })} /></>}
    <section className="document-area">
      <div className={`editing-area mode-${layout.mode} ${showPreview ? "show-preview" : ""}`}>
        <section className="code-pane" style={{ display: showPreview || layout.mode === "builder" ? "none" : "flex", flexBasis: layout.mode === "split" ? `${layout.splitRatio * 100}%` : "100%" }}><div className="pane-heading"><span className="pane-title"><Icon name="code" />Исходный код</span><small>BBCode</small>{layout.mode === "split" && <button className="panel-close" aria-label="Закрыть исходный код" onClick={() => setLayout({ ...layout, mode: "builder" })}>×</button>}</div>{editor}</section>
        {!showPreview && layout.mode === "split" && <Splitter ratio value={layout.splitRatio} resetValue={.5} min={.25} max={.75} label="Соотношение кода и конструктора" onChange={(splitRatio) => setLayout({ ...layout, splitRatio })} />}
        {!showPreview && layout.mode !== "code" && <section className="builder-pane"><div className="pane-heading"><span className="pane-title"><Icon name="builder" />Конструктор</span><small>Двустороннее редактирование</small>{layout.mode === "split" && <button className="panel-close" aria-label="Закрыть конструктор" onClick={() => setLayout({ ...layout, mode: "code" })}>×</button>}</div>{builder}</section>}
        {showPreview && <section className="panel preview"><div className="pane-heading"><h2>Предпросмотр</h2><button className="panel-close" aria-label="Закрыть предпросмотр" onClick={onClosePreview}>×</button></div>{preview}</section>}
      </div>{properties}
    </section>
  </section>;
}
