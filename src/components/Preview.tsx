import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Node, Span } from "../analysis/types";
import { createPositionIndex, type PositionIndex } from "../document/positions";
import { decodeDocument, type DocumentState } from "../document/state";
import { readPreviewSelection, type PreviewSelection } from "./previewSelection";

interface PreviewProps { document?: DocumentState; source: string; nodes: Node[]; onNavigate(span: Span): void; onSelection?(range: PreviewSelection): void; openExternal?(url: string): void }

export function safeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function Preview({ document, source, nodes, onNavigate, onSelection, openExternal }: PreviewProps) {
  const positions = useMemo(() => createPositionIndex(source), [source]);
  const effectiveDocument = useMemo(() => document ?? decodeDocument(new TextEncoder().encode(source)), [document, source]);
  const root = useRef<HTMLDivElement>(null), [selection, setSelection] = useState<PreviewSelection | null>(null);
  const read = () => { if (!root.current) return; const range = readPreviewSelection(root.current, effectiveDocument); if (range) { setSelection(range); onSelection?.(range); } };
  return <div className="rendered-post" ref={root} onMouseUp={read}><div className="preview-actions"><button disabled={!selection} onClick={() => selection && onNavigate({ start: positions.utf16ToByte(selection.from), end: positions.utf16ToByte(selection.to) })}>К исходнику</button></div>{nodes.map((node, index) => <RenderNode key={`${node.span.start}-${index}`} node={node} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />)}</div>;
}

function RenderNode({ node, source, positions, onNavigate, openExternal }: { node: Node; source: string; positions: PositionIndex; onNavigate(span: Span): void; openExternal?: (url: string) => void }): ReactNode {
  const from = positions.byteToUtf16(node.span.start), to = positions.byteToUtf16(node.span.end);
  if (node.kind === "text") return <span data-source-from={from} data-source-to={to}>{source.slice(from, to)}</span>;
  const children = node.children.map((child, index) => <RenderNode key={`${child.span.start}-${index}`} node={child} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />);
  const name = node.name ?? "";
  let rendered: ReactNode;
  if (name === "b") rendered = <strong>{children}</strong>;
  else if (name === "i") rendered = <em>{children}</em>;
  else if (name === "u") rendered = <u>{children}</u>;
  else if (name === "s") rendered = <s>{children}</s>;
  else if (name === "sub") rendered = <sub>{children}</sub>;
  else if (name === "sup") rendered = <sup>{children}</sup>;
  else if (name === "quote") rendered = <blockquote>{children}</blockquote>;
  else if (name === "code") rendered = <pre className="bb-code">{children}</pre>;
  else if (name === "list") rendered = <ul>{children}</ul>;
  else if (name === "*") rendered = <li>{children}</li>;
  else if (name === "spoiler") rendered = <details><summary onDoubleClick={() => onNavigate(node.span)}>{formatTitle(node.parameter ?? "Спойлер")}</summary><div>{children}</div></details>;
  else if (name === "img") rendered = <span className="media-placeholder" data-context-surface="media" data-source-value={plainText(node, source, positions)}>Изображение: {plainText(node, source, positions)}</span>;
  else if (name === "attachment") rendered = <span className="media-placeholder" data-context-surface="media" data-source-value={node.parameter ?? ""}>Вложение: {node.parameter}</span>;
  if (name === "url") {
    const raw = node.parameter ?? plainText(node, source, positions);
    const safe = safeExternalUrl(raw);
    rendered = safe ? <a href={safe} data-context-surface="link" onClick={(event) => { event.preventDefault(); openExternal?.(safe); }}>{children}</a> : <span>{children}</span>;
  }
  if (rendered === undefined) {
    const style = safeStyle(name, node.parameter);
    if (style) rendered = <span style={style}>{children}</span>;
    else if (["left", "center", "right"].includes(name)) rendered = <div style={{ textAlign: name as CSSProperties["textAlign"] }}>{children}</div>;
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
