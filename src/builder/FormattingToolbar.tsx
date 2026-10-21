import { useState } from "react";
import type { FormatTag } from "../document/formatting";
interface Props { disabled: boolean; onFormat(tag: FormatTag, parameter?: string): void; onSpoiler(): void; onUndo(): void; onRedo(): void }
export function FormattingToolbar(props: Props) {
  const [color, setColor] = useState("#a9b7ff"), [background, setBackground] = useState("#3b4252"), [link, setLink] = useState(false), [url, setUrl] = useState("https://");
  return <div className="format-toolbar" role="toolbar" aria-label="Оформление текста" onMouseDown={(event) => { if ((event.target as HTMLElement).tagName === "BUTTON") event.preventDefault(); }}>
    <button title="Отменить · Ctrl+Z" aria-label="Отменить" onClick={props.onUndo}>↶</button><button title="Повторить · Ctrl+Shift+Z" aria-label="Повторить" onClick={props.onRedo}>↷</button><span className="toolbar-divider" />
    {([['b', 'Жирный', 'B'], ['i', 'Курсив', 'I'], ['u', 'Подчёркнутый', 'U'], ['s', 'Зачёркнутый', 'S']] as const).map(([tag, title, text]) => <button disabled={props.disabled} key={tag} title={title} aria-label={title} className={`format-${tag}`} onClick={() => props.onFormat(tag)}>{text}</button>)}
    <span className="toolbar-divider" />
    <label className="color-control" title="Цвет текста"><span>A</span><input disabled={props.disabled} aria-label="Цвет текста" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button disabled={props.disabled} aria-label="Применить цвет текста" onClick={() => props.onFormat("color", color)}>▾</button></label>
    <label className="color-control" title="Цвет фона"><span>▰</span><input disabled={props.disabled} aria-label="Цвет фона" type="color" value={background} onChange={(event) => setBackground(event.target.value)} /><button disabled={props.disabled} aria-label="Применить цвет фона" onClick={() => props.onFormat("background", background)}>▾</button></label>
    <button disabled={props.disabled} aria-label="Добавить ссылку" onClick={() => setLink(!link)}>↗</button><button disabled={props.disabled} onClick={() => props.onFormat("quote")}>❞</button><button disabled={props.disabled} aria-label="Блок кода" onClick={() => props.onFormat("code")}>〈/〉</button><button disabled={props.disabled} aria-label="Список" onClick={() => props.onFormat("list")}>☷</button><span className="toolbar-divider" /><button disabled={props.disabled} className="new-spoiler" onClick={props.onSpoiler}>▣ Спойлер</button>
    {link && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); props.onFormat("url", url); setLink(false); }}><input aria-label="Адрес ссылки" value={url} onChange={(event) => setUrl(event.target.value)} /><button type="submit">Применить</button></form>}
  </div>;
}
