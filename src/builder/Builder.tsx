import { useMemo, useRef, useState } from "react";
import type { AnalysisSnapshot, Node } from "../analysis/types";
import type { DocumentState } from "../document/state";
import type { EditCommand, SourceRange } from "../document/commands";
import { identity } from "../document/commands";
import { createPositionIndex } from "../document/positions";
import { nodeRef, type NodeRef } from "../document/structure";
import { TextLeaf } from "./TextLeaf";
import { literalPaste, textEditCommand } from "./input";
import { readVisualSelection, type VisualRange } from "./selection";
import { safeExternalUrl } from "../components/Preview";
import { LazyBlockGroup, SpoilerBlock } from "./Block";

export interface BuilderProps {
  document: DocumentState; snapshot: AnalysisSnapshot | null;
  execute(command: EditCommand): void; getDocument(): DocumentState;
  onSelect(ref: NodeRef | null): void; onRange(range: VisualRange): void;
  onNavigate(range: SourceRange): void; onError(message: string): void;
  onComposition(active: boolean): void;
}
export function Builder(props: BuilderProps) {
  const root = useRef<HTMLDivElement>(null);
  const [insertionPath, setInsertionPath] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<SourceRange | null>(null);
  const retained = useRef<AnalysisSnapshot | null>(null);
  if (props.snapshot?.documentId === props.document.id) retained.current = props.snapshot;
  if (retained.current?.documentId !== props.document.id) retained.current = null;
  const snapshot = retained.current;
  const source = snapshot?.source ?? props.document.text;
  const index = useMemo(() => createPositionIndex(source), [source]);
  const pendingChange = useMemo(() => {
    const current = props.document.text;
    if (source === current) return null;
    let start = 0, oldEnd = source.length, end = current.length;
    while (start < oldEnd && start < end && source[start] === current[start]) start++;
    while (oldEnd > start && end > start && source[oldEnd - 1] === current[end - 1]) { oldEnd--; end--; }
    return { start, oldEnd, delta: end - oldEnd };
  }, [source, props.document.text]);
  const [paste, setPaste] = useState<{ range: SourceRange; text: string; documentId: string; revision: number } | null>(null);
  const select = () => { if (root.current) { const range = readVisualSelection(root.current, props.getDocument()); if (range) { setSelectedRange(range); props.onRange(range); } } };
  const run = (build: () => EditCommand) => { try { props.execute(build()); } catch (error) { props.onError(String(error)); } };
  const render = (node: Node, path: string, literal = false): React.ReactNode => {
    let from = index.byteToUtf16(node.span.start), to = index.byteToUtf16(node.span.end);
    if (node.kind === "text") {
      let text = source.slice(from, to);
      if (pendingChange) {
        const { start, oldEnd, delta } = pendingChange;
        if (start >= from && oldEnd <= to) { to += delta; text = props.document.text.slice(from, to); }
        else if (oldEnd <= from) { from += delta; to += delta; }
      }
      if (text.length > 65536) return <button className="opaque-block" key={path} onClick={() => props.onNavigate({ from, to })}>Большой текстовый блок · Редактировать код</button>;
      return <TextLeaf key={path} autoFocus={path === insertionPath} literal={literal} onError={props.onError} editable={snapshot?.revision === props.document.revision} text={text} from={from} to={to} onEdit={(range, value, expected) => { try { props.execute(textEditCommand(props.getDocument(), range, value, expected)); } catch (error) { props.onError(String(error)); throw error; } }} onSelect={select} onComposition={props.onComposition} onPasteCode={(range, text) => setPaste({ range, text, ...identity(props.getDocument()) })} />;
    }
    const reference = nodeRef(snapshot!, node);
    const children = () => node.children.length ? node.children.map((child, at) => render(child, `${path}.${at}`, literal || node.name === "code")) : render({ kind: "text", name: null, parameter: null, span: node.contentSpan, contentSpan: node.contentSpan, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, `${path}.empty`, literal || node.name === "code");
    const selectNode = (event: React.MouseEvent) => { event.stopPropagation(); const range = { from, to }; setSelectedRange(range); props.onRange({ ...identity(props.document), ...range }); props.onSelect(reference); };
    const known = ["b", "i", "u", "s", "color", "background", "url", "quote", "code", "list", "*", "spoiler", "size", "font", "left", "center", "right", "sub", "sup", "img", "attachment"];
    if (!node.wellFormed || !known.includes(node.name ?? "")) return <div key={path} className="opaque-block" onClick={selectNode}><span>{node.wellFormed ? `Неизвестный тег [${node.name}]` : "Повреждённая разметка"}</span><code>{source.slice(from, to)}</code><button onClick={() => props.onNavigate({ from, to })}>Редактировать код</button></div>;
    if (node.name === "spoiler") return <SpoilerBlock key={path} title={node.parameter ?? "Спойлер"} depth={path.split(".").length - 1} onSelect={selectNode} onInsert={() => { const at = index.byteToUtf16(node.contentSpan.end); props.onRange({ ...identity(props.document), from: at, to: at }); props.onSelect(reference); setInsertionPath(`${path}.insert`); }}>{() => <>{insertionPath === `${path}.insert` ? node.children.map((child, at) => render(child, `${path}.${at}`)) : children()}{insertionPath === `${path}.insert` && render({ kind: "text", name: null, parameter: null, span: { start: node.contentSpan.end, end: node.contentSpan.end }, contentSpan: { start: node.contentSpan.end, end: node.contentSpan.end }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, `${path}.insert`)}</>}</SpoilerBlock>;
    if (node.name === "img" || node.name === "attachment") return <button key={path} className="media-placeholder" onClick={selectNode}>{node.name === "img" ? "▧ Изображение" : "▤ Вложение"} · Свойства</button>;
    if (node.name === "code") return <pre className="builder-code" key={path} onClick={selectNode}>{children()}</pre>;
    if (node.name === "quote") return <blockquote key={path} onClick={selectNode}>{children()}</blockquote>;
    if (node.name === "list") return <ul key={path} onClick={selectNode}>{children()}</ul>;
    if (node.name === "*") return <li key={path} onClick={selectNode}>{children()}</li>;
    const style: React.CSSProperties = {};
    if (node.name === "b") style.fontWeight = 700;
    if (node.name === "i") style.fontStyle = "italic";
    if (node.name === "sub" || node.name === "sup") { style.verticalAlign = node.name; style.fontSize = "smaller"; }
    if (node.name === "u") style.textDecoration = "underline";
    if (node.name === "s") style.textDecoration = "line-through";
    if (node.name === "color" && /^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(node.parameter ?? "")) style.color = node.parameter!;
    if (node.name === "background" && /^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(node.parameter ?? "")) style.backgroundColor = node.parameter!;
    if (node.name === "size" && /^\d+$/.test(node.parameter ?? "")) style.fontSize = `${Math.min(48, Math.max(8, Number(node.parameter) * 4))}px`;
    if (node.name === "font" && /^[\w -]{1,40}$/.test(node.parameter ?? "")) style.fontFamily = node.parameter!;
    if (["left", "center", "right"].includes(node.name ?? "")) return <div key={path} style={{ textAlign: node.name as "left" | "center" | "right" }} onClick={selectNode}>{children()}</div>;
    if (node.name === "url") return <span key={path} className={safeExternalUrl(node.parameter ?? "") ? "builder-link" : ""} title={node.parameter ?? ""} onClick={selectNode}>{children()}</span>;
    return <span key={path} style={style} onClick={selectNode}>{children()}</span>;
  };
  return <div className="builder" ref={root} onMouseUp={select}>
    <div className="builder-caption"><span>ВИЗУАЛЬНЫЙ ДОКУМЕНТ</span><small>{snapshot?.revision === props.document.revision ? "Синхронизирован с кодом" : "Обновление структуры…"}</small><button disabled={!selectedRange} onClick={() => selectedRange && props.onNavigate(selectedRange)}>К исходнику</button></div>
    <div className="builder-page">{snapshot ? Array.from({ length: Math.ceil(snapshot.analysis.nodes.length / 30) }, (_, group) => <LazyBlockGroup key={`${props.document.id}-${group}`} eager={group === 0} count={Math.min(30, snapshot.analysis.nodes.length - group * 30)}>{() => snapshot.analysis.nodes.slice(group * 30, group * 30 + 30).map((node, at) => render(node, String(group * 30 + at)))}</LazyBlockGroup>) : <p>Анализ документа…</p>}{snapshot?.analysis.nodes.length === 0 && render({ kind: "text", name: null, parameter: null, span: { start: 0, end: 0 }, contentSpan: { start: 0, end: 0 }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, "empty")}</div>
    {paste && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-label="Вставить текст"><h3>В тексте найдены BBCode-теги</h3><pre>{paste.text}</pre><button onClick={() => { run(() => ({ ...paste, label: "Вставить BBCode", changes: [{ ...paste.range, insert: paste.text }] })); setPaste(null); }}>Вставить как BBCode</button><button onClick={() => { run(() => ({ ...paste, label: "Вставить буквальный текст", changes: [{ ...paste.range, insert: literalPaste(paste.text) }] })); setPaste(null); }}>Буквально в code</button><button onClick={() => setPaste(null)}>Отмена</button></section></div>}
  </div>;
}
