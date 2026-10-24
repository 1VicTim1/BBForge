import { useMemo, useState } from "react";
import type { AnalysisSnapshot, Node } from "../analysis/types";
import type { DocumentState } from "../document/state";
import { identity, type EditCommand } from "../document/commands";
import { extractNode, moveNode, nodeRef, renameSpoiler, resolveNode, sourceRange, tidyBlankLines, unwrapNode, type NodeRef } from "../document/structure";
import { allNodes } from "../document/formatting";
import { SAFE_COLOR, tagRole } from "../bbcode/tags";
import { stripTags } from "../bbcode/labels";
import { highlightSpans } from "../editor/highlight";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";

interface Props { document: DocumentState; snapshot: AnalysisSnapshot; selected: NodeRef; execute(command: EditCommand): void; onError(message: string): void; onNavigate(): void }
export function Properties(props: Props) {
  let node: Node, parent: Node | null, siblings: Node[];
  try { ({ node, parent, siblings } = resolveNode(props.document, props.snapshot, props.selected)); }
  catch { return <div className="properties muted">Обновление выбранного блока… <button onClick={props.onNavigate}>К исходнику</button></div>; }
  return <PropertyForm key={`${node.span.start}-${props.document.revision}`} {...props} node={node} parent={parent} siblings={siblings} />;
}

/** Spoiler titles are often "[b][color=red]Title[/color][/b]": split them into text and the usual wrappers. */
function parseTitle(parameter: string) {
  let rest = parameter.trim(), bold = false, italic = false, color = "";
  for (let changed = true; changed;) {
    changed = false;
    const b = /^\[b\]([\s\S]*)\[\/b\]$/i.exec(rest); if (b) { bold = true; rest = b[1]; changed = true; }
    const i = /^\[i\]([\s\S]*)\[\/i\]$/i.exec(rest); if (i) { italic = true; rest = i[1]; changed = true; }
    const c = /^\[color=([^\]]+)\]([\s\S]*)\[\/color\]$/i.exec(rest); if (c && !color) { color = c[1]; rest = c[2]; changed = true; }
  }
  return { text: rest, bold, italic, color, simple: !/\[/.test(rest) };
}
const composeTitle = (text: string, bold: boolean, italic: boolean, color: string) => {
  let value = text;
  if (color) value = `[color=${color}]${value}[/color]`;
  if (italic) value = `[i]${value}[/i]`;
  if (bold) value = `[b]${value}[/b]`;
  return value;
};

function MiniSource({ text }: { text: string }) {
  const { spans } = useMemo(() => highlightSpans(text), [text]);
  const parts: React.ReactNode[] = []; let cursor = 0;
  for (const span of spans) { if (span.from < cursor) continue; parts.push(text.slice(cursor, span.from), <span key={span.from} className={`bb-${span.kind}`}>{text.slice(span.from, span.to)}</span>); cursor = span.to; }
  parts.push(text.slice(cursor));
  return <pre className="mini-source" aria-label="Исходник блока">{parts}</pre>;
}

function PropertyForm({ node, parent, siblings, ...props }: Props & { node: Node; parent: Node | null; siblings: Node[] }) {
  const range = sourceRange(props.document, node.span), contentRange = sourceRange(props.document, node.contentSpan);
  const title = parseTitle(node.parameter ?? "");
  const [parameter, setParameter] = useState(node.name === "img" ? props.document.text.slice(contentRange.from, contentRange.to) : node.parameter ?? "");
  const [heading, setHeading] = useState(title.simple ? title.text : node.parameter ?? ""), [bold, setBold] = useState(title.bold), [italic, setItalic] = useState(title.italic), [color, setColor] = useState(title.color);
  const [destination, setDestination] = useState("");
  const destinations = allNodes(props.snapshot.analysis.nodes).filter((item) => item.name === "spoiler" && item.wellFormed && !(item.span.start >= node.span.start && item.span.end <= node.span.end));
  const run = (build: () => EditCommand) => { try { props.execute(build()); } catch (error) { props.onError(String(error)); } };
  const peers = siblings.filter((item) => item.kind !== "text"), at = peers.indexOf(node);
  const move = (direction: -1 | 1) => { const target = peers[at + direction]; if (target) run(() => moveNode(props.document, props.snapshot, props.selected, { node: nodeRef(props.snapshot, target), placement: direction < 0 ? "before" : "after" })); };
  const lineOf = (offset: number) => (props.document.text.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
  const [first, last] = [lineOf(range.from), lineOf(Math.max(range.from, range.to - 1))];
  const source = props.document.text.slice(range.from, Math.min(range.to, range.from + 400)) + (range.to - range.from > 400 ? "…" : "");
  const rename = (value: string) => run(() => renameSpoiler(props.document, props.snapshot, props.selected, value));
  const titleValue = title.simple ? composeTitle(heading, bold, italic, color) : heading;
  const parameterKind = ["attachment", "img", "url", "color", "background", "size", "font"].includes(node.name ?? "");
  const swatch = (node.name === "color" || node.name === "background") && SAFE_COLOR.test(parameter) ? parameter : null;
  return <section className="properties" aria-label="Свойства блока">
    <div className="properties-title"><span className={`block-chip tag-name role-${tagRole(node.name)}`}>{node.name}</span><small>{first === last ? `строка ${first}` : `строки ${first}–${last}`}{parent?.name ? ` · в ${parent.name}` : ""}</small></div>
    {node.name === "spoiler" && <form onSubmit={(event) => { event.preventDefault(); rename(titleValue); }}>
      <label className="property-label">Заголовок<span className="property-field"><input aria-label="Заголовок спойлера" value={heading} onChange={(event) => setHeading(event.target.value)} /></span></label>
      {title.simple && <div className="property-label">Оформление заголовка<span className="property-field">
        <button type="button" className={`format-b ${bold ? "active" : ""}`} aria-pressed={bold} aria-label="Заголовок полужирным" onClick={() => { setBold(!bold); rename(composeTitle(heading, !bold, italic, color)); }}><Icon name="bold" /></button>
        <button type="button" className={`format-i ${italic ? "active" : ""}`} aria-pressed={italic} aria-label="Наклонный заголовок" onClick={() => { setItalic(!italic); rename(composeTitle(heading, bold, !italic, color)); }}><Icon name="italic" /></button>
        <span className="swatch" style={{ background: color && SAFE_COLOR.test(color) ? color : "transparent" }} aria-hidden="true" />
        <input aria-label="Цвет заголовка" placeholder="цвет, напр. royalblue" value={color} onChange={(event) => setColor(event.target.value.trim())} onBlur={() => { if (color !== title.color && (!color || SAFE_COLOR.test(color))) rename(composeTitle(heading, bold, italic, color)); }} />
      </span></div>}
      <button type="submit" disabled={titleValue === (node.parameter ?? "") || !heading.trim()}>Применить</button>
    </form>}
    {parameterKind && <form onSubmit={(event) => { event.preventDefault(); run(() => {
      if (/[\]\r\n]/.test(parameter)) throw new Error("Параметр содержит недопустимые символы");
      const span = node.name === "img" ? node.contentSpan : node.openingSpan!;
      return { ...identity(props.document), label: "Изменить свойства", changes: [{ ...sourceRange(props.document, span), insert: node.name === "img" ? parameter : `[${node.name}=${parameter}]` }] };
    }); }}>
      <label className="property-label">{node.name === "img" ? "Адрес изображения" : node.name === "url" ? "Адрес ссылки" : node.name === "color" ? "Цвет текста" : node.name === "background" ? "Цвет фона" : node.name === "size" ? "Размер" : "Параметр"}
        <span className="property-field">{swatch !== null && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}<input aria-label="Параметр блока" value={parameter} onChange={(event) => setParameter(event.target.value)} /></span></label>
      <button type="submit" disabled={parameter === (node.name === "img" ? props.document.text.slice(contentRange.from, contentRange.to) : node.parameter ?? "")}>Применить</button>
    </form>}
    {node.name === "spoiler" && !title.simple && <p className="muted">Заголовок с вложенной разметкой: {stripTags(node.parameter ?? "")}</p>}
    <div className="properties-divider" />
    <div className="property-label">Исходник<MiniSource text={source} /></div>
    <div className="block-actions">
      <button className="wide" onClick={props.onNavigate}><Icon name="code" /><span>Открыть в коде</span></button>
      <button disabled={at <= 0} onClick={() => move(-1)}><span>↑ Выше</span></button><button disabled={at >= peers.length - 1} onClick={() => move(1)}><span>↓ Ниже</span></button>
      <button className="wide" disabled={parent?.name !== "spoiler"} onClick={() => run(() => extractNode(props.document, props.snapshot, props.selected))}><span>↰ Вынести наружу</span></button>
      {node.name === "spoiler" && <button className="wide" title="Удалить пустые строки в начале и конце спойлера и схлопнуть повторяющиеся" onClick={() => { try { const command = tidyBlankLines(props.document, props.snapshot, props.selected); if (command) props.execute(command); else props.onError("Лишних пустых строк нет"); } catch (error) { props.onError(String(error)); } }}><span>Убрать пустые строки</span></button>}
      <button disabled={!node.closingSpan} onClick={() => run(() => unwrapNode(props.document, props.snapshot, props.selected))}><span>{node.name === "spoiler" ? "Распаковать" : "Снять тег"}</span></button>
      <button className="danger-action" onClick={() => run(() => ({ ...identity(props.document), label: "Удалить блок", changes: [{ ...range, insert: "" }] }))}><span>Удалить блок</span></button>
    </div>
    {destinations.length > 0 && <form className="move-form" onSubmit={(event) => { event.preventDefault(); const target = destinations.find((item) => String(item.span.start) === destination); if (target) run(() => moveNode(props.document, props.snapshot, props.selected, { node: nodeRef(props.snapshot, target), placement: "inside" })); }}>
      <div className="property-label">Переместить в спойлер<Select label="Целевой спойлер" placeholder="Выберите спойлер…" value={destination} options={destinations.map((item) => ({ value: String(item.span.start), label: stripTags(item.parameter ?? "") || "Спойлер" }))} onChange={(next) => setDestination(String(next))} /></div>
      <button disabled={!destination} type="submit">Переместить внутрь</button>
    </form>}
  </section>;
}
