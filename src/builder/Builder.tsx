import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSnapshot, Node } from "../analysis/types";
import type { DocumentState } from "../document/state";
import type { EditCommand, SourceRange } from "../document/commands";
import { identity } from "../document/commands";
import { createPositionIndex } from "../document/positions";
import { copyVisualRange, moveVisualRange, nodeRef, placeNodeAt, type NodeRef } from "../document/structure";
import { EdgeAutoScroller } from "../drag/edgeAutoScroll";
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
  scroll?: ScrollPosition; onScrollPosition?(position: ScrollPosition): void;
  storedSelection?: SourceRange; restoreFocus?: boolean;
}
export function Builder(props: BuilderProps) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const selectionRef = useRef<SourceRange | null>(null);
  const snapshotRef = useRef<AnalysisSnapshot | null>(null);
  const [insertionPath, setInsertionPath] = useState<string | null>(null);
  useLayoutEffect(() => { if (root.current) { root.current.scrollLeft = props.scroll?.left ?? 0; root.current.scrollTop = props.scroll?.top ?? 0; } }, [props.document.id]);
  useLayoutEffect(() => { if (root.current && props.storedSelection) restoreVisualSelection(root.current, props.storedSelection, props.restoreFocus); }, [props.document.id]);
  const [selectedRange, setSelectedRangeState] = useState<SourceRange | null>(null);
  const setSelectedRange = (range: SourceRange | null) => { selectionRef.current = range; setSelectedRangeState(range); };
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
    const setEditable = (enabled: boolean) => {
      for (const item of Array.from(host.querySelectorAll<HTMLElement>(".visual-text"))) item.contentEditable = enabled && item.dataset.visualEditable !== "false" ? "true" : "false";
    };
    const placeCaret = (leaf: HTMLElement, offset: number) => {
      highlightSelection(offset, offset); leaf.focus({ preventScroll: true }); restoreVisualSelection(host, { from: offset, to: offset }, true); select();
    };
    const selectText = (event: PointerEvent, leaf: HTMLElement) => {
      event.preventDefault();
      const anchor = sourceOffsetAt(event.clientX, event.clientY);
      let head = anchor;
      setEditable(false);
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
        setEditable(true);
        head = sourceOffsetAt(event.clientX, event.clientY) ?? head;
        requestAnimationFrame(() => {
          if (anchor !== null && head !== null && head !== anchor) {
            const range = { from: Math.min(anchor, head), to: Math.max(anchor, head) };
            highlightSelection(range.from, range.to); setSelectedRange(range); latest.current.onRange({ ...identity(latest.current.getDocument()), ...range });
          }
          else if (anchor !== null) placeCaret(leaf, anchor);
        });
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
    };
    type Payload = { kind: "text"; range: SourceRange } | { kind: "node"; element: HTMLElement };
    type Slot = { parent: Element; before: Element | null };
    type Drop = { kind: "text"; at: number } | { kind: "block"; at: number; slot: Slot | null };
    const caret = document.createElement("div"); caret.className = "visual-drop-caret"; caret.hidden = true;
    const ghost = document.createElement("div"); ghost.className = "visual-drop-ghost"; ghost.setAttribute("aria-hidden", "true");
    const preview = document.createElement("div"); preview.className = "visual-drag-preview"; preview.hidden = true;
    const spanOf = (element: HTMLElement) => ({ start: Number(element.dataset.dragStart), end: Number(element.dataset.dragEnd) });
    const atFrom = (element: Element) => Number((element as HTMLElement).dataset.atFrom);
    const blockChildren = (container: Element) => (container.classList.contains("builder-page")
      ? Array.from(container.querySelectorAll(":scope > .lazy-block-group > [data-at-from]"))
      : Array.from(container.querySelectorAll(":scope > [data-at-from]")));
    const slotIn = (container: HTMLElement, y: number, source: HTMLElement): { at: number; slot: Slot } => {
      const children = blockChildren(container).filter((child) => child !== source);
      const next = children.find((child) => { const rect = child.getBoundingClientRect(); return rect.top + rect.height / 2 > y; });
      if (next) return { at: atFrom(next), slot: { parent: next.parentElement!, before: next } };
      if (container.classList.contains("builder-page")) {
        const groups = container.querySelectorAll(":scope > .lazy-block-group"), last = groups[groups.length - 1] ?? container;
        return { at: latest.current.getDocument().text.length, slot: { parent: last, before: null } };
      }
      return { at: Number(container.dataset.atContentEnd), slot: { parent: container, before: container.querySelector(":scope > .empty-insert") } };
    };
    let lastDrop: Drop | null = null;
    let hoverOpen: { element: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
    const locate = (payload: Payload, x: number, y: number): Drop | null => {
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest(".visual-drop-ghost")) return lastDrop;
      if (hoverOpen && !hoverOpen.element.querySelector(":scope > summary")?.contains(hit)) { clearTimeout(hoverOpen.timer); hoverOpen = null; }
      if (payload.kind === "text") {
        const at = sourceOffsetAt(x, y);
        return at === null || (at >= payload.range.from && at <= payload.range.to) ? null : { kind: "text", at };
      }
      if (!hit || !host.contains(hit) || payload.element.contains(hit)) return null;
      const summary = hit.closest("summary"), spoiler = summary?.parentElement as HTMLElement | undefined;
      if (summary && spoiler) {
        if (!(spoiler as HTMLDetailsElement).open && hoverOpen?.element !== spoiler) {
          if (hoverOpen) clearTimeout(hoverOpen.timer);
          hoverOpen = { element: spoiler, timer: setTimeout(() => { (spoiler as HTMLDetailsElement).open = true; }, 650) };
        }
        const rect = summary.getBoundingClientRect(), lower = y > rect.top + rect.height / 2;
        const body = (spoiler as HTMLDetailsElement).open ? spoiler.querySelector<HTMLElement>(":scope > .spoiler-body") : null;
        if (lower && body) {
          const first = blockChildren(body).find((child) => child !== payload.element);
          return first ? { kind: "block", at: atFrom(first), slot: { parent: body, before: first } } : { kind: "block", ...slotIn(body, Infinity, payload.element) };
        }
        return { kind: "block", at: Number(lower ? spoiler.dataset.atTo : spoiler.dataset.atFrom), slot: { parent: spoiler.parentElement!, before: lower ? spoiler.nextElementSibling : spoiler } };
      }
      if (hit.closest(".visual-text")) {
        const at = sourceOffsetAt(x, y);
        return at === null ? null : { kind: "block", at, slot: null };
      }
      const container = hit.closest<HTMLElement>(".spoiler-body, .builder-page") ?? (hit.closest(".builder-caption") ? null : host.querySelector<HTMLElement>(".builder-page"));
      return container ? { kind: "block", ...slotIn(container, y, payload.element) } : null;
    };
    const textGhost = document.createElement("div"); textGhost.className = "visual-drop-text-ghost"; textGhost.hidden = true;
    const showCaret = (at: number, label: string | null) => {
      const leaf = Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from]")).find((item) => Number(item.dataset.sourceFrom) <= at && at <= Number(item.dataset.sourceTo));
      const text = leaf?.firstChild;
      if (!leaf || !text) return;
      const range = document.createRange(), offset = Math.min(text.textContent?.length ?? 0, at - Number(leaf.dataset.sourceFrom));
      range.setStart(text, offset); range.collapse(true);
      const rect = range.getClientRects()[0] ?? leaf.getBoundingClientRect(), base = host.getBoundingClientRect();
      Object.assign(caret.style, { left: `${rect.left - base.left + host.scrollLeft}px`, top: `${rect.top - base.top + host.scrollTop}px`, height: `${rect.height || 18}px` });
      caret.hidden = false;
      textGhost.hidden = !label;
      if (label) { textGhost.textContent = label; Object.assign(textGhost.style, { left: caret.style.left, top: caret.style.top, lineHeight: `${rect.height || 18}px` }); }
    };
    let ghostLabel: string | null = null;
    const paint = (drop: Drop | null) => {
      lastDrop = drop;
      caret.hidden = true; textGhost.hidden = true;
      if (!drop?.kind || drop.kind !== "block" || !drop.slot) ghost.remove();
      if (!drop) return;
      if (drop.kind === "block" && drop.slot) {
        if (ghost.parentElement !== drop.slot.parent || ghost.nextElementSibling !== drop.slot.before) drop.slot.parent.insertBefore(ghost, drop.slot.before);
        return;
      }
      showCaret(drop.at, drop.kind === "text" ? ghostLabel : null);
    };
    const apply = (payload: Payload, drop: Drop, copy: boolean) => {
      const current = latest.current, document = current.getDocument(), snapshot = snapshotRef.current;
      if (!snapshot) return;
      try {
        let command: EditCommand | null = null;
        if (payload.kind === "text" && drop.kind === "text") command = (copy ? copyVisualRange : moveVisualRange)(document, snapshot, payload.range, drop.at);
        else if (payload.kind === "node" && drop.kind === "block") command = placeNodeAt(document, snapshot, { ...identity(document), span: spanOf(payload.element) }, drop.at, copy);
        if (!command) return;
        current.execute(command);
        highlightSelection(0, 0); setSelectedRange(null);
      } catch (error) { current.onError(String(error)); }
    };
    const fillPreview = (payload: Payload) => {
      preview.replaceChildren();
      ghostLabel = null;
      if (payload.kind === "text") { ghostLabel = latest.current.getDocument().text.slice(payload.range.from, payload.range.to).replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").slice(0, 80); preview.textContent = ghostLabel; }
      else {
        const head = payload.element.querySelector(":scope > summary") ?? payload.element;
        const copy = head.cloneNode(true) as HTMLElement; copy.removeAttribute("data-at-from");
        preview.append(copy);
      }
      ghost.replaceChildren();
      if (payload.kind === "node") { const head = payload.element.querySelector(":scope > summary"); ghost.append((head ?? payload.element).cloneNode(true)); ghost.className = `visual-drop-ghost visual-drop-ghost-${payload.element.dataset.dragKind}`; }
    };
    const movePreview = (x: number, y: number) => { preview.style.transform = `translate(${x + 14}px, ${y + 12}px)`; };
    const scroller = new EdgeAutoScroller();
    const gesture = (event: PointerEvent, payload: Payload, onClick: () => void) => {
      const startX = event.clientX, startY = event.clientY;
      let dragging = false, drop: Drop | null = null, lastX = startX, lastY = startY;
      const update = (copy: boolean) => { host.dataset.dragCopy = String(copy); preview.dataset.copy = String(copy); drop = locate(payload, lastX, lastY); paint(drop); };
      const move = (next: PointerEvent) => {
        if (!(next.buttons & 1)) return;
        lastX = next.clientX; lastY = next.clientY;
        if (!dragging) {
          if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
          dragging = true; setEditable(false); window.getSelection()?.removeAllRanges();
          host.classList.add("visual-dragging"); if (payload.kind === "node") payload.element.classList.add("visual-drag-source");
          fillPreview(payload); preview.hidden = false;
        }
        movePreview(lastX, lastY);
        next.preventDefault();
        scroller.update(host, lastY); update(next.ctrlKey);
      };
      const noSelect = (selection: Event) => selection.preventDefault();
      document.addEventListener("selectstart", noSelect, true);
      const onScroll = () => { if (dragging) update(host.dataset.dragCopy === "true"); };
      const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); finish(null); } else if (dragging && next.key === "Control") update(next.type === "keydown"); };
      const finish = (end: PointerEvent | null) => {
        window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
        window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true); host.removeEventListener("scroll", onScroll);
        document.removeEventListener("selectstart", noSelect, true);
        scroller.stop(); paint(null); ghost.remove(); preview.hidden = true; setEditable(true);
        if (hoverOpen) { clearTimeout(hoverOpen.timer); hoverOpen = null; }
        host.classList.remove("visual-dragging"); delete host.dataset.dragCopy;
        if (payload.kind === "node") payload.element.classList.remove("visual-drag-source");
        if (!dragging) { if (end) onClick(); return; }
        const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation(); };
        window.addEventListener("click", swallow, true); setTimeout(() => window.removeEventListener("click", swallow, true), 0);
        if (end && drop) apply(payload, drop, end.ctrlKey);
      };
      const up = (end: PointerEvent) => finish(end);
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
      window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true); host.addEventListener("scroll", onScroll);
    };
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      if (event.button !== 0 || target.closest("button,input,textarea,.insertion-text")) return;
      const leaf = target.closest<HTMLElement>(".visual-text");
      if (leaf) {
        const selected = selectionRef.current, offset = sourceOffsetAt(event.clientX, event.clientY);
        if (selected && selected.from < selected.to && offset !== null && offset >= selected.from && offset <= selected.to) {
          event.preventDefault();
          gesture(event, { kind: "text", range: selected }, () => { highlightSelection(0, 0); setSelectedRange(null); placeCaret(leaf, offset); });
          return;
        }
        selectText(event, leaf);
        return;
      }
      const summary = target.closest("summary");
      const element = (summary ? summary.parentElement : target.matches(".spoiler-body, .builder-spoiler") ? target.closest(".builder-spoiler") : null) as HTMLElement | null;
      if (element?.dataset.dragKind === "spoiler" && host.contains(element)) { window.getSelection()?.removeAllRanges(); gesture(event, { kind: "node", element }, () => undefined); }
    };
    host.append(caret, textGhost); document.body.append(preview);
    host.addEventListener("pointerdown", down, true);
    return () => { host.removeEventListener("pointerdown", down, true); caret.remove(); textGhost.remove(); ghost.remove(); preview.remove(); scroller.stop(); if (typeof CSS !== "undefined") (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("bbforge-selection"); };
  }, [props.document.id]);
  const retained = useRef<AnalysisSnapshot | null>(null);
  if (props.snapshot?.documentId === props.document.id) retained.current = props.snapshot;
  if (retained.current?.documentId !== props.document.id) retained.current = null;
  const snapshot = retained.current;
  snapshotRef.current = snapshot;
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
  const dragTarget = (reference: NodeRef, kind: "spoiler" | "list" | "item" | "text", from: number, to: number) => ({ "data-drag-kind": kind, "data-drag-start": reference.span.start, "data-drag-end": reference.span.end, "data-at-from": from, "data-at-to": to });
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
      return <span key={path} className="visual-text-node" {...dragTarget(reference, "text", from, to)}><TextLeaf autoFocus={path === insertionPath} literal={literal} onError={props.onError} editable={snapshot?.revision === props.document.revision} text={text} from={from} to={to} onEdit={(range, value, expected) => { try { props.execute(textEditCommand(props.getDocument(), range, value, expected)); } catch (error) { props.onError(String(error)); throw error; } }} onSelect={select} onComposition={props.onComposition} onPasteCode={(range, text) => setPaste({ range, text, ...identity(props.getDocument()) })} /></span>;
    }
    const reference = nodeRef(snapshot!, node);
    const structural = ["spoiler", "list", "*", "quote", "code", "img", "attachment"].includes(node.name ?? "");
    const children = () => node.children.length ? node.children.map((child, at) => render(child, `${path}.${at}`, literal || node.name === "code", structural ? undefined : reference)) : render({ kind: "text", name: null, parameter: null, span: node.contentSpan, contentSpan: node.contentSpan, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, `${path}.empty`, literal || node.name === "code", structural ? undefined : reference);
    const selectNode = (event: React.MouseEvent) => { event.stopPropagation(); const range = { from, to }; setSelectedRange(range); props.onRange({ ...identity(props.document), ...range }); props.onSelect(reference); };
    const known = ["b", "i", "u", "s", "color", "background", "url", "quote", "code", "list", "*", "spoiler", "size", "font", "left", "center", "right", "sub", "sup", "img", "attachment"];
    if (!node.wellFormed || !known.includes(node.name ?? "")) return <div key={path} className="opaque-block" data-at-from={from} data-at-to={to} onClick={selectNode}><span>{node.wellFormed ? `Неизвестный тег [${node.name}]` : "Повреждённая разметка"}</span><code>{source.slice(from, to)}</code><button onClick={() => props.onNavigate({ from, to })}>Редактировать код</button></div>;
    if (node.name === "spoiler") {
      const insertPath = `${path}.insert`;
      const insertAt = index.byteToUtf16(node.contentSpan.end);
      return <SpoilerBlock key={path} title={node.parameter ?? "Спойлер"} depth={path.split(".").length - 1} dragTarget={dragTarget(reference, "spoiler", from, to)} contentEnd={insertAt} onSelect={selectNode} onInsert={() => { props.onRange({ ...identity(props.document), from: insertAt, to: insertAt }); props.onSelect(reference); setInsertionPath(insertPath); }}>{() => <>{children()}{insertionPath === insertPath && <InsertionDraft onCommit={(value) => { setInsertionPath(null); run(() => textEditCommand(props.getDocument(), { from: insertAt, to: insertAt }, value, "")); }} onCancel={() => setInsertionPath(null)} />}</>}</SpoilerBlock>;
    }
    if (node.name === "img" || node.name === "attachment") return <button key={path} className="media-placeholder" data-at-from={from} data-at-to={to} onClick={selectNode}>{node.name === "img" ? "▧ Изображение" : "▤ Вложение"} · Свойства</button>;
    if (node.name === "code") return <pre className="builder-code" key={path} data-at-from={from} data-at-to={to} onClick={selectNode}>{children()}</pre>;
    if (node.name === "quote") return <blockquote key={path} data-at-from={from} data-at-to={to} onClick={selectNode}>{children()}</blockquote>;
    if (node.name === "list") return <ul key={path} {...dragTarget(reference, "list", from, to)} onClick={selectNode}>{children()}</ul>;
    if (node.name === "*") return <li key={path} {...dragTarget(reference, "item", from, to)} onClick={selectNode}>{children()}</li>;
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
    if (["left", "center", "right"].includes(node.name ?? "")) return <div key={path} data-at-from={from} data-at-to={to} style={{ textAlign: node.name as "left" | "center" | "right" }} onClick={selectNode}>{children()}</div>;
    if (node.name === "url") return <span key={path} data-at-from={from} data-at-to={to} className={safeExternalUrl(node.parameter ?? "") ? "builder-link" : ""} title={node.parameter ?? ""} onClick={selectNode}>{children()}</span>;
    return <span key={path} data-at-from={from} data-at-to={to} style={style} onClick={selectNode}>{children()}</span>;
  };
  return <div className="builder" ref={root} onMouseUp={select} onCopy={(event) => { if (selectedRange && selectedRange.from !== selectedRange.to) { event.preventDefault(); event.clipboardData.setData("text/plain", props.document.text.slice(selectedRange.from, selectedRange.to)); } }} onScroll={(event) => props.onScrollPosition?.({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}>
    <div className="builder-caption"><span>ВИЗУАЛЬНЫЙ ДОКУМЕНТ</span><small>{snapshot?.revision === props.document.revision ? "Синхронизирован с кодом" : "Обновление структуры…"}</small><button disabled={!selectedRange} onClick={() => selectedRange && props.onNavigate(selectedRange)}>К исходнику</button></div>
    <div className="builder-page">{snapshot ? Array.from({ length: Math.ceil(snapshot.analysis.nodes.length / 30) }, (_, group) => <LazyBlockGroup key={`${props.document.id}-${group}`} eager={group === 0} count={Math.min(30, snapshot.analysis.nodes.length - group * 30)}>{() => snapshot.analysis.nodes.slice(group * 30, group * 30 + 30).map((node, at) => render(node, String(group * 30 + at)))}</LazyBlockGroup>) : <p>Анализ документа…</p>}{snapshot?.analysis.nodes.length === 0 && render({ kind: "text", name: null, parameter: null, span: { start: 0, end: 0 }, contentSpan: { start: 0, end: 0 }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, "empty")}</div>
    {paste && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-label="Вставить текст"><h3>В тексте найдены BBCode-теги</h3><pre>{paste.text}</pre><button onClick={() => { run(() => ({ ...paste, label: "Вставить BBCode", changes: [{ ...paste.range, insert: paste.text }] })); setPaste(null); }}>Вставить как BBCode</button><button onClick={() => { run(() => ({ ...paste, label: "Вставить буквальный текст", changes: [{ ...paste.range, insert: literalPaste(paste.text) }] })); setPaste(null); }}>Буквально в code</button><button onClick={() => setPaste(null)}>Отмена</button></section></div>}
  </div>;
}
