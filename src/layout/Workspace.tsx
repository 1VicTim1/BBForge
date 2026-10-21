import type { ReactNode } from "react";
import { Splitter } from "./Splitter";
import type { LayoutSettings } from "./settings";
export function Workspace({ layout, setLayout, outline, editor, builder, preview, showPreview, properties }: { layout: LayoutSettings; setLayout(value: LayoutSettings): void; outline: ReactNode; editor: ReactNode; builder: ReactNode; preview: ReactNode; showPreview: boolean; properties: ReactNode }) {
  return <section className="ide-workspace">
    {layout.showOutline && <><aside className="panel outline" style={{ width: layout.outlineWidth }}><div className="tool-heading"><h2>Структура</h2><span>BBCode</span></div>{outline}</aside><Splitter value={layout.outlineWidth} min={180} max={480} label="Ширина структуры" onChange={(outlineWidth) => setLayout({ ...layout, outlineWidth })} /></>}
    <section className="document-area">
      <div className={`editing-area mode-${layout.mode} ${showPreview ? "show-preview" : ""}`}>
        <section className="code-pane" style={{ display: showPreview || layout.mode === "builder" ? "none" : "flex", flexBasis: layout.mode === "split" ? `${layout.splitRatio * 100}%` : "100%" }}><div className="pane-heading"><span>⌘ Исходный код</span><small>BBCode</small></div>{editor}</section>
        {!showPreview && layout.mode === "split" && <Splitter ratio value={layout.splitRatio} min={.25} max={.75} label="Соотношение кода и конструктора" onChange={(splitRatio) => setLayout({ ...layout, splitRatio })} />}
        {!showPreview && layout.mode !== "code" && <section className="builder-pane"><div className="pane-heading"><span>▣ Конструктор</span><small>Двустороннее редактирование</small></div>{builder}</section>}
        {showPreview && <section className="panel preview"><h2>Предпросмотр</h2>{preview}</section>}
      </div>{properties}
    </section>
  </section>;
}
