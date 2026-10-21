import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { Node, Span } from "../analysis/types";
import { createPositionIndex, type PositionIndex } from "../document/positions";

interface PreviewProps { source: string; nodes: Node[]; onNavigate(span: Span): void; openExternal?(url: string): void }

export function safeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function Preview({ source, nodes, onNavigate, openExternal }: PreviewProps) {
  const positions = useMemo(() => createPositionIndex(source), [source]);
  return <div className="rendered-post">{nodes.map((node, index) => <RenderNode key={`${node.span.start}-${index}`} node={node} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />)}</div>;
}

function RenderNode({ node, source, positions, onNavigate, openExternal }: { node: Node; source: string; positions: PositionIndex; onNavigate(span: Span): void; openExternal?: (url: string) => void }): ReactNode {
  if (node.kind === "text") return source.slice(positions.byteToUtf16(node.span.start), positions.byteToUtf16(node.span.end));
  const children = node.children.map((child, index) => <RenderNode key={`${child.span.start}-${index}`} node={child} source={source} positions={positions} onNavigate={onNavigate} openExternal={openExternal} />);
  const name = node.name ?? "";
  if (name === "b") return <strong>{children}</strong>;
  if (name === "i") return <em>{children}</em>;
  if (name === "u") return <u>{children}</u>;
  if (name === "s") return <s>{children}</s>;
  if (name === "sub") return <sub>{children}</sub>;
  if (name === "sup") return <sup>{children}</sup>;
  if (name === "quote") return <blockquote>{children}</blockquote>;
  if (name === "code") return <pre className="bb-code">{children}</pre>;
  if (name === "list") return <ul>{children}</ul>;
  if (name === "*") return <li>{children}</li>;
  if (name === "spoiler") return <details><summary onDoubleClick={() => onNavigate(node.span)}>{formatTitle(node.parameter ?? "Спойлер")}</summary><div>{children}</div></details>;
  if (name === "img") return <span className="media-placeholder" data-context-surface="media" data-source-value={plainText(node, source, positions)}>Изображение: {plainText(node, source, positions)}</span>;
  if (name === "attachment") return <span className="media-placeholder" data-context-surface="media" data-source-value={node.parameter ?? ""}>Вложение: {node.parameter}</span>;
  if (name === "url") {
    const raw = node.parameter ?? plainText(node, source, positions);
    const safe = safeExternalUrl(raw);
    return safe ? <a href={safe} data-context-surface="link" onClick={(event) => { event.preventDefault(); openExternal?.(safe); }}>{children}</a> : <span>{children}</span>;
  }
  const style = safeStyle(name, node.parameter);
  if (style) return <span style={style}>{children}</span>;
  if (["left", "center", "right"].includes(name)) return <div style={{ textAlign: name as CSSProperties["textAlign"] }}>{children}</div>;
  return <span>{children}</span>;
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
