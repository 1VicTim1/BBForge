import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Node, Span } from "../analysis/types";
import { createPositionIndex, type PositionIndex } from "../document/positions";
import { decodeDocument, type DocumentState } from "../document/state";
import { readPreviewSelection, type PreviewSelection } from "./previewSelection";
import type { ScrollPosition } from "../workspace/session";
import { renderStyle, tagSpec, type ResolvedTag } from "../bbcode/profile";
import { ResolvedImage } from "../plugins/images";

interface PreviewProps { document?: DocumentState; source: string; nodes: Node[]; scroll?: ScrollPosition; onScrollPosition?(position: ScrollPosition): void; onNavigate(span: Span): void; onSelection?(range: PreviewSelection): void; openExternal?(url: string): void }

export function safeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function Preview({ document, source, nodes, scroll, onScrollPosition, onNavigate, onSelection, openExternal }: PreviewProps) {
  const positions = useMemo(() => createPositionIndex(source), [source]);
  const effectiveDocument = useMemo(() => document ?? decodeDocument(new TextEncoder().encode(source)), [document, source]);
  const root = useRef<HTMLDivElement>(null), [selection, setSelection] = useState<PreviewSelection | null>(null);
  useEffect(() => setSelection(null), [effectiveDocument.id, effectiveDocument.revision]);
  useLayoutEffect(() => { if (root.current) { root.current.scrollLeft = scroll?.left ?? 0; root.current.scrollTop = scroll?.top ?? 0; } }, [effectiveDocument.id]);
  const read = () => { if (!root.current) return; const range = readPreviewSelection(root.current, effectiveDocument); if (range) { setSelection(range); onSelection?.(range); } };
  return <div className="rendered-post" ref={root} onMouseUp={read} onScroll={(event) => onScrollPosition?.({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}><span className="preview-badge">Приблизительный рендер · не пиксель-в-пиксель</span><div className="preview-actions"><button disabled={!selection} onClick={() => selection && onNavigate({ start: positions.utf16ToByte(selection.from), end: positions.utf16ToByte(selection.to) })}>К исходнику</button></div><div className="preview-content">{nodes.map((node, index) => <RenderNode key={`${node.span.start}-${index}`} node={node} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />)}</div></div>;
}

function RenderNode({ node, source, positions, onNavigate, openExternal }: { node: Node; source: string; positions: PositionIndex; onNavigate(span: Span): void; openExternal?: (url: string) => void }): ReactNode {
  const from = positions.byteToUtf16(node.span.start), to = positions.byteToUtf16(node.span.end);
  if (node.kind === "text") return <span data-source-from={from} data-source-to={to}>{source.slice(from, to)}</span>;
  const children = node.children.map((child, index) => <RenderNode key={`${child.span.start}-${index}`} node={child} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />);
  const name = node.name ?? "", spec = tagSpec(name), tag = spec?.builtin ?? null;
  let rendered: ReactNode;
  if (tag === "b") rendered = <strong>{children}</strong>;
  else if (tag === "i") rendered = <em>{children}</em>;
  else if (tag === "u") rendered = <u>{children}</u>;
  else if (tag === "s") rendered = <s>{children}</s>;
  else if (tag === "sub") rendered = <sub>{children}</sub>;
  else if (tag === "sup") rendered = <sup>{children}</sup>;
  else if (tag === "quote") rendered = <blockquote>{children}</blockquote>;
  else if (tag === "code") rendered = <pre className="bb-code">{children}</pre>;
  else if (tag === "list") rendered = <ul>{children}</ul>;
  else if (tag === "*") rendered = <li>{children}</li>;
  else if (tag === "spoiler") rendered = <details><summary onDoubleClick={() => onNavigate(node.span)}>{formatTitle(node.parameter ?? spec?.label ?? "Спойлер")}</summary><div>{children}</div></details>;
  else if (tag === "img") { const address = plainText(node, source, positions); rendered = <span className="preview-media" data-context-surface="media" data-source-value={address}><ResolvedImage url={address} className="preview-image" fallback={<span className="media-placeholder">▧ {address.split(/[\\/]/).at(-1)?.split("?")[0] || "Изображение"}</span>} /></span>; }
  else if (tag === "attachment") rendered = <span className="media-placeholder" data-context-surface="media" data-source-value={node.parameter ?? ""}>Вложение: {node.parameter}</span>;
  if (tag === "url") {
    const raw = node.parameter ?? plainText(node, source, positions);
    const safe = safeExternalUrl(raw);
    rendered = safe ? <a href={safe} data-context-surface="link" onClick={(event) => { event.preventDefault(); openExternal?.(safe); }}>{children}</a> : <span>{children}</span>;
  }
  if (rendered === undefined && spec && !tag && spec.render) rendered = <PlainTag spec={spec} value={node.parameter}>{children}</PlainTag>;
  if (rendered === undefined) {
    const style = tag ? safeStyle(tag, node.parameter) : null;
    if (style) rendered = <span style={style}>{children}</span>;
    else if (tag === "left" || tag === "center" || tag === "right") rendered = <div style={{ textAlign: tag as CSSProperties["textAlign"] }}>{children}</div>;
    else rendered = <span>{children}</span>;
  }
  return <span className="preview-source-node" data-source-span data-source-from={from} data-source-to={to}>{rendered}</span>;
}

function plainText(node: Node, source: string, positions: PositionIndex): string {
  return node.children.map((child) => child.kind === "text" ? source.slice(positions.byteToUtf16(child.span.start), positions.byteToUtf16(child.span.end)) : plainText(child, source, positions)).join("");
}

export function formatTitle(parameter: string): ReactNode {
  const text = parameter.replace(/\[[^\]]+\]/g, "").trim() || "Спойлер";
  const color = parameter.match(/\[color=([^\]]+)\]/i)?.[1];
  const content = /\[b\]/i.test(parameter) ? <strong>{text}</strong> : text;
  return color && safeColor(color) ? <span style={{ color }}>{content}</span> : content;
}

function safeStyle(name: string, parameter: string | null): CSSProperties | null {
  if (!parameter) return null;
  if (name === "color" && safeColor(parameter)) return { color: parameter };
  if (name === "background" && safeColor(parameter)) return { backgroundColor: parameter };
  if (name === "size" && /^\d{1,2}$/.test(parameter)) return { fontSize: `${Math.min(48, Math.max(8, Number(parameter) * 4))}px` };
  if (name === "font" && /^[\w -]{1,40}$/i.test(parameter)) return { fontFamily: parameter };
  return null;
}

function safeColor(value: string): boolean { return /^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value); }

/** A tag a plugin profile describes only by its render spec: whitelisted element and styles. */
export function PlainTag({ spec, value, children, ...attributes }: { spec: ResolvedTag; value: string | null; children: ReactNode } & Record<`data-${string}`, string | number | undefined> & { onClick?(event: React.MouseEvent): void }) {
  const render = spec.render!, caption = render.caption?.replace("{value}", value ?? "").trim();
  const inner = render.element === "details" ? <><summary>{caption || spec.label || spec.name}</summary><div>{children}</div></> : <>{caption && <span className="bb-plain-caption">{caption} </span>}{children}</>;
  return createElement(render.element, { className: ["bb-plain", `bb-tag-${spec.name.replace(/[^\w-]/g, "")}`, render.className].filter(Boolean).join(" "), style: renderStyle(spec, value), ...attributes }, inner);
}
