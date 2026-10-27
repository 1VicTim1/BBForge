import { Fragment, useEffect, useState, type ReactNode } from "react";
import { safeExternalUrl } from "../components/Preview";
import { Icon, type IconName } from "../components/Icon";
import { PluginIcon, PluginItemView, uiAttributes, useSlot } from "../plugins/context";
import type { SlotEntry } from "../plugins/ui";
import { supports, type BuiltinTag } from "../bbcode/profile";
import { TooltipButton } from "../components/TooltipButton";
import type { FormatTag, FormattingActionState } from "../document/formatting";
interface Props { synced?: boolean; disabled: boolean; states?: Partial<Record<FormatTag, FormattingActionState>>; onFormat(tag: FormatTag, parameter?: string): void; onSpoiler(): void; onUndo(): void; onRedo(): void }
export function FormattingToolbar(props: Props) {
  const [color, setColor] = useState("#a9b7ff"), [background, setBackground] = useState("#3b4252"), [link, setLink] = useState(false), [url, setUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  useEffect(() => { const open = () => { if (!props.disabled) setLink(true); }; window.addEventListener("bbforge:link", open); return () => window.removeEventListener("bbforge:link", open); }, [props.disabled]);
  const blocked = (tag: FormatTag) => props.disabled || props.states?.[tag]?.state === "disabled";
  const reason = (tag: FormatTag, fallback: string) => props.states?.[tag]?.reason ?? fallback;
  const active = (tag: FormatTag) => props.states?.[tag]?.state === "on";
  type Render = (entry: SlotEntry<Render>) => ReactNode;
  const attrs = (entry: SlotEntry<Render>, base = "") => uiAttributes(entry, base);
  const label = (entry: SlotEntry<Render>, fallback: string) => entry.title ?? fallback;
  const glyph = (entry: SlotEntry<Render>, fallback: IconName) => entry.icon ? <PluginIcon icon={entry.icon} owner={entry.owner} /> : <Icon name={fallback} />;
  const toggle = (tag: FormatTag, title: string, icon: IconName, key: string): Render => (entry) => { const action = props.states?.[tag]; return <button {...attrs(entry, `format-${tag}`)} disabled={props.disabled || action?.state === "disabled"} title={action?.reason ?? `${label(entry, title)} (${key})`} aria-label={label(entry, title)} aria-pressed={action?.state === "on"} data-state={action?.state} onClick={() => props.onFormat(tag)}>{glyph(entry, icon)}</button>; };
  const block = (tag: FormatTag, title: string, description: string, icon: IconName): Render => (entry) => <TooltipButton {...attrs(entry)} disabled={blocked(tag)} label={label(entry, title)} description={reason(tag, description)} aria-pressed={active(tag)} data-state={props.states?.[tag]?.state} onClick={() => props.onFormat(tag)}>{glyph(entry, icon)}</TooltipButton>;
  const divider: Render = (entry) => <span {...attrs(entry, "toolbar-divider")} />;
  const base: Array<{ id: string; value: Render; tag?: BuiltinTag }> = [
    { id: "format.undo", value: (entry) => <TooltipButton {...attrs(entry)} label={label(entry, "Отменить")} description="Отменить последнее изменение" shortcut="Ctrl+Z" onClick={props.onUndo}>{glyph(entry, "undo")}</TooltipButton> },
    { id: "format.redo", value: (entry) => <TooltipButton {...attrs(entry)} label={label(entry, "Повторить")} description="Вернуть отменённое изменение" shortcut="Ctrl+Shift+Z" onClick={props.onRedo}>{glyph(entry, "redo")}</TooltipButton> },
    { id: "toolbar.format.history-end", value: divider },
    { id: "format.bold", tag: "b", value: toggle("b", "Жирный", "bold", "Ctrl+B") },
    { id: "format.italic", tag: "i", value: toggle("i", "Курсив", "italic", "Ctrl+I") },
    { id: "format.underline", tag: "u", value: toggle("u", "Подчёркнутый", "underline", "Ctrl+U") },
    { id: "format.strike", tag: "s", value: toggle("s", "Зачёркнутый", "strike", "Ctrl+Shift+X") },
    { id: "toolbar.format.text-end", value: divider },
    { id: "format.color", tag: "color", value: (entry) => <label {...attrs(entry, "color-control")} title={reason("color", label(entry, "Цвет текста"))} style={{ "--swatch": color } as React.CSSProperties}><span className="color-glyph" aria-hidden="true">A</span><input disabled={blocked("color")} aria-label={label(entry, "Цвет текста")} type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button disabled={blocked("color")} aria-pressed={active("color")} data-state={props.states?.color?.state} title={active("color") ? "Снять цвет текста" : "Применить выбранный цвет текста"} aria-label="Применить цвет текста" onClick={() => props.onFormat("color", active("color") ? undefined : color)}><Icon name="check" /></button></label> },
    { id: "format.background", tag: "background", value: (entry) => <label {...attrs(entry, "color-control")} title={reason("background", label(entry, "Цвет фона"))}><input disabled={blocked("background")} aria-label={label(entry, "Цвет фона")} type="color" value={background} onChange={(event) => setBackground(event.target.value)} /><button disabled={blocked("background")} aria-pressed={active("background")} data-state={props.states?.background?.state} title={active("background") ? "Снять цвет фона" : "Применить выбранный цвет фона"} aria-label="Применить цвет фона" onClick={() => props.onFormat("background", active("background") ? undefined : background)}><Icon name="check" /></button></label> },
    { id: "toolbar.format.color-end", value: divider },
    { id: "format.link", tag: "url", value: (entry) => <TooltipButton {...attrs(entry)} disabled={blocked("url")} label={label(entry, "Добавить ссылку")} description={reason("url", active("url") ? "Удалить ссылку, сохранив текст" : "Оформить выделенный текст как ссылку")} aria-pressed={active("url")} data-state={props.states?.url?.state} onClick={() => active("url") ? props.onFormat("url") : setLink(!link)}>{glyph(entry, "link")}</TooltipButton> },
    { id: "format.quote", tag: "quote", value: block("quote", "Цитата", "Обернуть выделение в блок цитаты", "quote") },
    { id: "format.code", tag: "code", value: block("code", "Блок кода", "Обернуть выделение в блок кода", "code") },
    { id: "format.list", tag: "list", value: block("list", "Список", "Создать список из выделенного текста", "list") },
    { id: "toolbar.format.block-end", value: divider },
    { id: "format.spoiler", tag: "spoiler", value: (entry) => <button {...attrs(entry, "new-spoiler")} disabled={props.disabled} aria-label={label(entry, "Создать спойлер")} title={`${label(entry, "Создать спойлер")} из выделения (Ctrl+Shift+E)`} onClick={props.onSpoiler}>{glyph(entry, "spoiler")}<span>{entry.title ?? "Спойлер"}</span></button> },
    { id: "toolbar.format.spacer", value: (entry) => <span {...attrs(entry, "spacer")} /> },
    { id: "format.sync", value: (entry) => <span {...attrs(entry, `sync-state ${props.synced === false ? "pending" : ""}`)} role="status" title={props.synced === false ? "Синхронизация…" : "Синхронизировано"}><span className="sync-label">{props.synced === false ? "Синхронизация…" : "Синхронизировано"}</span></span> },
  ];
  // Buttons for tags the forum profile does not have are left out.
  const entries = useSlot("toolbar.format", base.filter((item) => !item.tag || supports(item.tag)));
  return <div className="format-toolbar" role="toolbar" aria-label="Оформление текста" data-ui-id="toolbar.format" onMouseDown={(event) => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
    {entries.map((entry) => <Fragment key={entry.id}>{entry.builtin ? entry.builtin(entry) : <PluginItemView entry={entry} variant="toolbar" />}</Fragment>)}
    {link && <form className="inline-form" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setLink(false); setLinkError(""); } }} onSubmit={(event) => { event.preventDefault(); if (!safeExternalUrl(url.trim())) { setLinkError("Введите адрес http, https или mailto"); return; } props.onFormat("url", url.trim()); setLink(false); setLinkError(""); }}><input autoFocus aria-label="Адрес ссылки" aria-invalid={!!linkError} placeholder="https://example.com" value={url} onChange={(event) => { setUrl(event.target.value); setLinkError(""); }} /><button type="submit">Применить</button><button type="button" onClick={() => { setLink(false); setLinkError(""); }}>Отмена</button>{linkError && <span role="alert" className="link-error">{linkError}</span>}</form>}
  </div>;
}
