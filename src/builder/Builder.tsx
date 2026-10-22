import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type HTMLAttributes } from "react";
import type { AnalysisSnapshot, Node } from "../analysis/types";
import type { DocumentState } from "../document/state";
import type { EditCommand, SourceRange } from "../document/commands";
import { identity } from "../document/commands";
import { createPositionIndex } from "../document/positions";
import { nodeRef, type NodeRef } from "../document/structure";
import { TextLeaf } from "./TextLeaf";
import { literalPaste, textEditCommand } from "./input";
import { readVisualSelection, restoreVisualSelection, type VisualRange } from "./selection";
import { safeExternalUrl } from "../components/Preview";
import { LazyBlockGroup, SpoilerBlock } from "./Block";
import { InsertionDraft } from "./InsertionDraft";
import type { ScrollPosition } from "../workspace/session";

export interface BuilderProps {
  document: DocumentState; snapshot: AnalysisSnapshot | null;
  execute(command: EditCommand): void; getDocument(): DocumentState;
  onSelect(ref: NodeRef | null): void; onRange(range: VisualRange): void;
  onNavigate(range: SourceRange): void; onError(message: string): void;
  onComposition(active: boolean): void;
  onMove?(source: NodeRef, target: NodeRef, placement: "before" | "inside" | "after"): void;
  onExtract?(source: NodeRef): void;
  scroll?: ScrollPosition; onScrollPosition?(position: ScrollPosition): void;
  storedSelection?: SourceRange; restoreFocus?: boolean;
}
export function Builder(props: BuilderProps) {
  const root = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const [insertionPath, setInsertionPath] = useState<string | null>(null);
  useLayoutEffect(() => { if (root.current) { root.current.scrollLeft = props.scroll?.left ?? 0; root.current.scrollTop = props.scroll?.top ?? 0; } }, [props.document.id]);
  useLayoutEffect(() => { if (root.current && props.storedSelection) restoreVisualSelection(root.current, props.storedSelection, props.restoreFocus); }, [props.document.id]);
  const [selectedRange, setSelectedRange] = useState<SourceRange | null>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const sourceOffsetAt = (x: number, y: number): number | null => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      const hitLeaf = hit?.closest<HTMLElement>(".visual-text") ?? hit?.closest(".visual-text-node")?.querySelector<HTMLElement>(".visual-text");
      if (hitLeaf && host.contains(hitLeaf)) {
        const rect = hitLeaf.getBoundingClientRect(), from = Number(hitLeaf.dataset.sourceFrom), to = Number(hitLeaf.dataset.sourceTo);
        if (rect.width > 0 && to > from) return Math.round(from + Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * (to - from));
        return from;
      }
      const caret = document.caretPositionFromPoint?.(x, y);
      const fallback = !caret ? document.caretRangeFromPoint?.(x, y) : null;
      const node = caret?.offsetNode ?? fallback?.startContainer;
      const at = caret?.offset ?? fallback?.startOffset;
      if (!node || at === undefined) return null;
      let element = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest<HTMLElement>("[data-source-from]");
      if (!element || !host.contains(element)) {
        element = hit?.closest(".visual-text-node")?.querySelector<HTMLElement>(".visual-text") ?? null;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return x < rect.left + rect.width / 2 ? Number(element.dataset.sourceFrom) : Number(element.dataset.sourceTo);
      }
      const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(node, at);
      return Number(element.dataset.sourceFrom) + prefix.toString().length;
    };
    const highlightSelection = (from: number, to: number) => {
      const registry = typeof CSS === "undefined" ? undefined : (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
      if (!registry || !HighlightCtor) return;
      if (from === to) { registry.delete("bbforge-selection"); return; }
      const ranges: Range[] = [];
      for (const leaf of Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from][data-source-to]"))) {
        const leafFrom = Number(leaf.dataset.sourceFrom), leafTo = Number(leaf.dataset.sourceTo);
        const start = Math.max(from, leafFrom), end = Math.min(to, leafTo);
        if (start >= end || !leaf.firstChild) continue;
        const range = document.createRange(), length = leaf.firstChild.textContent?.length ?? 0;
        range.setStart(leaf.firstChild, Math.min(length, start - leafFrom));
        range.setEnd(leaf.firstChild, Math.min(length, end - leafFrom));
        ranges.push(range);
      }
      registry.set("bbforge-selection", new HighlightCtor(...ranges));
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target as Element).closest("button,summary,.visual-drag-handle")) return;
      const leaf = (event.target as Element).closest<HTMLElement>(".visual-text");
      if (!leaf) return;
      event.preventDefault();
      const anchor = sourceOffsetAt(event.clientX, event.clientY);
      let head = anchor;
      const leaves = Array.from(host.querySelectorAll<HTMLElement>(".visual-text[contenteditable]"));
      for (const item of leaves) item.contentEditable = "false";
      const move = (next: PointerEvent) => {
        if (anchor === null || !(next.buttons & 1)) return;
        head = sourceOffsetAt(next.clientX, next.clientY);
        if (head === null || head === anchor) return;
        next.preventDefault();
        highlightSelection(Math.min(anchor, head), Math.max(anchor, head));
      };
      const up = (event: PointerEvent) => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        for (const item of leaves) item.contentEditable = item.dataset.visualEditable === "false" ? "false" : "true";
        head = sourceOffsetAt(event.clientX, event.clientY) ?? head;
        requestAnimationFrame(() => {
          if (anchor !== null && head !== null && head !== anchor) {
            const range = { from: Math.min(anchor, head), to: Math.max(anchor, head) };
            highlightSelection(range.from, range.to); setSelectedRange(range); props.onRange({ ...identity(props.getDocument()), ...range });
          }
          else if (anchor !== null) { highlightSelection(anchor, anchor); leaf.focus({ preventScroll: true }); restoreVisualSelection(host, { from: anchor, to: anchor }, true); select(); }
        });
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
    };
    host.addEventListener("pointerdown", down, true);
    return () => { host.removeEventListener("pointerdown", down, true); if (typeof CSS !== "undefined") (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("bbforge-selection"); };
  }, [props.document.id]);
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
  const dragHandle = (reference: NodeRef, label: string) => <button type="button" className="visual-drag-handle" draggable aria-label={`Перетащить ${label}`} title="Перетащите вверх/вниз; вправо — вложить, влево — вынести" onClick={(event) => event.stopPropagation()} onDragStart={(event) => { dragStartX.current = event.clientX; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/bbforge-node", JSON.stringify(reference)); }}>⠿</button>;
  const dropTarget = (reference: NodeRef, node: Node): HTMLAttributes<HTMLElement> => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!props.onMove) return;
      event.preventDefault(); event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect(), dx = event.clientX - dragStartX.current;
      const placement = dx < -36 && props.onExtract ? "outside" : dx > 36 && node.name === "spoiler" ? "inside" : event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      event.currentTarget.dataset.dropPlacement = placement;
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => { delete event.currentTarget.dataset.dropPlacement; },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault(); event.stopPropagation();
      const placement = event.currentTarget.dataset.dropPlacement ?? "after";
      delete event.currentTarget.dataset.dropPlacement;
      try {
        const source = JSON.parse(event.dataTransfer.getData("application/bbforge-node")) as NodeRef;
        if (placement === "outside") props.onExtract?.(source);
        else props.onMove?.(source, reference, placement as "before" | "inside" | "after");
      } catch { /* drag from another application */ }
    },
  });
  const render = (node: Node, path: string, literal = false, movable?: NodeRef): React.ReactNode => {
    let from = index.byteToUtf16(node.span.start), to = index.byteToUtf16(node.span.end);
    if (node.kind === "text") {
      let text = source.slice(from, to);
      if (pendingChange) {
        const { start, oldEnd, delta } = pendingChange;
        if (start >= from && oldEnd <= to) { to += delta; text = props.document.text.slice(from, to); }
        else if (oldEnd <= from) { from += delta; to += delta; }
      }
      if (text.length > 65536) return <button className="opaque-block" key={path} onClick={() => props.onNavigate({ from, to })}>Большой текстовый блок · Редактировать код</button>;
      const reference = movable ?? nodeRef(snapshot!, node);
      return <span key={path} className="visual-text-node" {...dropTarget(reference, node)}>{dragHandle(reference, "текст")}<TextLeaf autoFocus={path === insertionPath} literal={literal} onError={props.onError} editable={snapshot?.revision === props.document.revision} text={text} from={from} to={to} onEdit={(range, value, expected) => { try { props.execute(textEditCommand(props.getDocument(), range, value, expected)); } catch (error) { props.onError(String(error)); throw error; } }} onSelect={select} onComposition={props.onComposition} onPasteCode={(range, text) => setPaste({ range, text, ...identity(props.getDocument()) })} /></span>;
    }
    const reference = nodeRef(snapshot!, node);
    const structural = ["spoiler", "list", "*", "quote", "code", "img", "attachment"].includes(node.name ?? "");
    const children = () => node.children.length ? node.children.map((child, at) => render(child, `${path}.${at}`, literal || node.name === "code", structural ? undefined : reference)) : render({ kind: "text", name: null, parameter: null, span: node.contentSpan, contentSpan: node.contentSpan, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, `${path}.empty`, literal || node.name === "code", structural ? undefined : reference);
    const selectNode = (event: React.MouseEvent) => { event.stopPropagation(); const range = { from, to }; setSelectedRange(range); props.onRange({ ...identity(props.document), ...range }); props.onSelect(reference); };
    const known = ["b", "i", "u", "s", "color", "background", "url", "quote", "code", "list", "*", "spoiler", "size", "font", "left", "center", "right", "sub", "sup", "img", "attachment"];
    if (!node.wellFormed || !known.includes(node.name ?? "")) return <div key={path} className="opaque-block" onClick={selectNode}><span>{node.wellFormed ? `Неизвестный тег [${node.name}]` : "Повреждённая разметка"}</span><code>{source.slice(from, to)}</code><button onClick={() => props.onNavigate({ from, to })}>Редактировать код</button></div>;
    if (node.name === "spoiler") {
      const insertPath = `${path}.insert`;
      const insertAt = index.byteToUtf16(node.contentSpan.end);
      return <SpoilerBlock key={path} title={node.parameter ?? "Спойлер"} depth={path.split(".").length - 1} dragHandle={dragHandle(reference, `спойлер ${node.parameter ?? ""}`)} dragTarget={dropTarget(reference, node)} onSelect={selectNode} onInsert={() => { props.onRange({ ...identity(props.document), from: insertAt, to: insertAt }); props.onSelect(reference); setInsertionPath(insertPath); }}>{() => <>{children()}{insertionPath === insertPath && <InsertionDraft onCommit={(value) => { setInsertionPath(null); run(() => textEditCommand(props.getDocument(), { from: insertAt, to: insertAt }, value, "")); }} onCancel={() => setInsertionPath(null)} />}</>}</SpoilerBlock>;
    }
    if (node.name === "img" || node.name === "attachment") return <button key={path} className="media-placeholder" onClick={selectNode}>{node.name === "img" ? "▧ Изображение" : "▤ Вложение"} · Свойства</button>;
    if (node.name === "code") return <pre className="builder-code" key={path} onClick={selectNode}>{children()}</pre>;
    if (node.name === "quote") return <blockquote key={path} onClick={selectNode}>{children()}</blockquote>;
    if (node.name === "list") return <ul key={path} {...dropTarget(reference, node)} onClick={selectNode}>{dragHandle(reference, "список")}{children()}</ul>;
    if (node.name === "*") return <li key={path} {...dropTarget(reference, node)} onClick={selectNode}>{dragHandle(reference, "элемент списка")}{children()}</li>;
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
  return <div className="builder" ref={root} onMouseUp={select} onCopy={(event) => { if (selectedRange && selectedRange.from !== selectedRange.to) { event.preventDefault(); event.clipboardData.setData("text/plain", props.document.text.slice(selectedRange.from, selectedRange.to)); } }} onScroll={(event) => props.onScrollPosition?.({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}>
    <div className="builder-caption"><span>ВИЗУАЛЬНЫЙ ДОКУМЕНТ</span><small>{snapshot?.revision === props.document.revision ? "Синхронизирован с кодом" : "Обновление структуры…"}</small><button disabled={!selectedRange} onClick={() => selectedRange && props.onNavigate(selectedRange)}>К исходнику</button></div>
    <div className="builder-page">{snapshot ? Array.from({ length: Math.ceil(snapshot.analysis.nodes.length / 30) }, (_, group) => <LazyBlockGroup key={`${props.document.id}-${group}`} eager={group === 0} count={Math.min(30, snapshot.analysis.nodes.length - group * 30)}>{() => snapshot.analysis.nodes.slice(group * 30, group * 30 + 30).map((node, at) => render(node, String(group * 30 + at)))}</LazyBlockGroup>) : <p>Анализ документа…</p>}{snapshot?.analysis.nodes.length === 0 && render({ kind: "text", name: null, parameter: null, span: { start: 0, end: 0 }, contentSpan: { start: 0, end: 0 }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, "empty")}</div>
    {paste && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-label="Вставить текст"><h3>В тексте найдены BBCode-теги</h3><pre>{paste.text}</pre><button onClick={() => { run(() => ({ ...paste, label: "Вставить BBCode", changes: [{ ...paste.range, insert: paste.text }] })); setPaste(null); }}>Вставить как BBCode</button><button onClick={() => { run(() => ({ ...paste, label: "Вставить буквальный текст", changes: [{ ...paste.range, insert: literalPaste(paste.text) }] })); setPaste(null); }}>Буквально в code</button><button onClick={() => setPaste(null)}>Отмена</button></section></div>}
  </div>;
}
