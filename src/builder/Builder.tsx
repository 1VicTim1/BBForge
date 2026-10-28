import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSnapshot, Node, Span } from "../analysis/types";
import type { DocumentState } from "../document/state";
import type { EditCommand, SourceRange } from "../document/commands";
import { identity } from "../document/commands";
import { createPositionIndex } from "../document/positions";
import { copyVisualRange, moveVisualRange, nodeRef, placeNodeAt, renameSpoiler, replaceVisualRange, type NodeRef } from "../document/structure";
import { EdgeAutoScroller } from "../drag/edgeAutoScroll";
import { TextLeaf } from "./TextLeaf";
import { literalPaste, textEditCommand } from "./input";
import { readVisualSelection, restoreVisualSelection, type VisualRange } from "./selection";
import { safeExternalUrl } from "../components/Preview";
import { LazyBlockGroup, SpoilerBlock } from "./Block";
import { InsertionDraft } from "./InsertionDraft";
import type { ScrollPosition } from "../workspace/session";
import { Icon } from "../components/Icon";
import { stripTags } from "../bbcode/labels";
import { builtinOf, isKnownTag, namesFor, profileVersion, tagFor, tagSpec, type BuiltinTag } from "../bbcode/profile";
import { allNodes } from "../document/formatting";
import { PlainTag } from "../components/Preview";
import { ResolvedImage } from "../plugins/images";

// Selecting "the whole line" takes its formatting wrappers along, but never block tags like [/spoiler].
let inlineCache: { version: number; close: RegExp; open: RegExp } | null = null;
function inlinePatterns() {
  if (inlineCache?.version === profileVersion()) return inlineCache;
  const names = namesFor("b", "i", "u", "s", "color", "size", "font", "background", "url", "sub", "sup").map((name) => name.replace(/[*-]/g, "\\$&")).join("|") || "(?!)";
  inlineCache = { version: profileVersion(), close: new RegExp(`^(?:\\[\\/(?:${names})\\])+`, "i"), open: new RegExp(`(?:\\[(?:${names})(?:=[^\\]\\n]*)?\\])+$`, "i") };
  return inlineCache;
}
const is = (node: Node | null | undefined, ...tags: BuiltinTag[]) => { const tag = builtinOf(node?.name); return tag !== null && tags.includes(tag); };
export interface BuilderProps {
  document: DocumentState; snapshot: AnalysisSnapshot | null;
  execute(command: EditCommand): void; getDocument(): DocumentState;
  onSelect(ref: NodeRef | null): void; onRange(range: VisualRange): void;
  onNavigate(range: SourceRange): void; onError(message: string): void;
  onComposition(active: boolean): void;
  scroll?: ScrollPosition; onScrollPosition?(position: ScrollPosition): void;
  storedSelection?: SourceRange; restoreFocus?: boolean;
  /** The block selected in the structure tree or inspector: drawn with an accent ring. */
  selectedSpan?: Span;
  /** "Исправить…" on an unknown or broken tag. */
  onFix?(range: SourceRange): void;
  /** Misspelt words of `text`, underlined while the builder shows that text. */
  spelling?: { text: string; ranges: Array<{ from: number; to: number }> };
  /** Status-bar hint while a block is dragged; null when the drag ends. */
  onDragHint?(hint: string | null): void;
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
  // Only a real text selection can be dragged as text; selecting a whole block must not turn into a text drag.
  const setSelectedRange = (range: SourceRange | null, text = false) => { selectionRef.current = text && range && range.from < range.to ? range : null; setSelectedRangeState(range); };
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    // The character under the pointer, measured per character: wrapped text spans several lines, so the
    // leaf's bounding box says nothing about where on which line the click landed.
    const offsetInLeaf = (leaf: HTMLElement, x: number, y: number): number | null => {
      const text = leaf.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) return null;
      const length = Math.min(text.textContent?.length ?? 0, 20000), range = document.createRange();
      let best: { at: number; score: number } | null = null;
      for (let at = 0; at < length; at++) {
        range.setStart(text, at); range.setEnd(text, at + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) continue;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0, dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const score = dy * 10000 + dx;
        if (!best || score < best.score) best = { at: x > rect.left + rect.width / 2 ? at + 1 : at, score };
        if (score === 0) break;
      }
      return best?.at ?? null;
    };
    /** Offsets (in the leaf's text) where the visual line of `line` starts and ends. */
    const lineEdges = (leaf: HTMLElement, line: DOMRect): { start: number; end: number } => {
      const text = leaf.firstChild, length = text?.textContent?.length ?? 0;
      if (!text || text.nodeType !== Node.TEXT_NODE) return { start: 0, end: 0 };
      const range = document.createRange(), middle = line.top + line.height / 2;
      let start = -1, end = -1;
      for (let at = 0; at < Math.min(length, 20000); at++) {
        range.setStart(text, at); range.setEnd(text, at + 1);
        const box = range.getBoundingClientRect();
        if (!box.width || box.top > middle || box.bottom < middle || text.textContent![at] === "\n") continue;
        if (start < 0) start = at;
        end = at + 1;
      }
      if (start >= 0) return { start, end };
      // An empty line part (the leaf starts with a line break): the place before that break.
      const breakAt = text.textContent!.indexOf("\n");
      return breakAt >= 0 && Math.abs(line.top - (leaf.getClientRects()[0]?.top ?? NaN)) < 1 ? { start: breakAt, end: breakAt } : { start: 0, end: length };
    };
    const sourceOffsetAt = (x: number, y: number): number | null => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      const hitLeaf = hit?.closest<HTMLElement>(".visual-text") ?? hit?.closest(".visual-text-node")?.querySelector<HTMLElement>(".visual-text");
      if (hitLeaf && host.contains(hitLeaf)) {
        const from = Number(hitLeaf.dataset.sourceFrom), at = offsetInLeaf(hitLeaf, x, y);
        return at === null ? from : from + at;
      }
      const nearest = (): number | null => {
        // WebKitGTK finds no caret outside the text column; pick the closest leaf on screen instead.
        let best: { leaf: HTMLElement; rect: DOMRect; score: number } | null = null;
        for (const leaf of Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from]"))) for (const rect of Array.from(leaf.getClientRects())) {
          const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0, dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
          const score = dy * 1000 + dx;
          if (!best || score < best.score) best = { leaf, rect, score };
        }
        if (!best) return null;
        const from = Number(best.leaf.dataset.sourceFrom), to = Number(best.leaf.dataset.sourceTo), text = latest.current.getDocument().text;
        // A leaf can span several lines: past the right or left edge means the end or start of the
        // line that was hit, not of the whole leaf. Only at the leaf's own edges do the adjacent
        // formatting tags come along (selecting "the whole line").
        const edges = lineEdges(best.leaf, best.rect);
        if (x >= best.rect.right) return from + edges.end === to ? to + (inlinePatterns().close.exec(text.slice(to))?.[0].length ?? 0) : from + edges.end;
        if (x <= best.rect.left) return from + edges.start === from ? from - (inlinePatterns().open.exec(text.slice(Math.max(0, from - 2000), from))?.[0].length ?? 0) : from + edges.start;
        return from + (offsetInLeaf(best.leaf, x, best.rect.top + best.rect.height / 2) ?? 0);
      };
      const caret = document.caretPositionFromPoint?.(x, y);
      const fallback = !caret ? document.caretRangeFromPoint?.(x, y) : null;
      const node = caret?.offsetNode ?? fallback?.startContainer;
      const at = caret?.offset ?? fallback?.startOffset;
      if (!node || at === undefined) return nearest();
      let element = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest<HTMLElement>("[data-source-from]");
      if (!element || !host.contains(element)) {
        element = hit?.closest(".visual-text-node")?.querySelector<HTMLElement>(".visual-text") ?? null;
        if (!element) return nearest();
        const rect = element.getBoundingClientRect();
        return x < rect.left + rect.width / 2 ? Number(element.dataset.sourceFrom) : Number(element.dataset.sourceTo);
      }
      const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(node, at);
      const offset = Number(element.dataset.sourceFrom) + prefix.toString().length;
      // Past the end (or before the start) of a line, take the adjacent closing (opening) tags too, so
      // selecting "the whole line" includes its formatting wrappers.
      const rects = Array.from(element.getClientRects()), text = latest.current.getDocument().text;
      if (offset === Number(element.dataset.sourceTo) && rects.length && x > rects[rects.length - 1].right) return offset + (inlinePatterns().close.exec(text.slice(offset))?.[0].length ?? 0);
      if (offset === Number(element.dataset.sourceFrom) && rects.length && x < rects[0].left) return offset - (inlinePatterns().open.exec(text.slice(Math.max(0, offset - 2000), offset))?.[0].length ?? 0);
      return offset;
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
    // The end of a line that ends with formatted text ("… [url=…]issues[/url]⏎") is one place for
    // the user, but two for the source: after "issues" and after "[/url]". A caret there goes inside.
    const insideFormatting = (offset: number) => {
      const text = latest.current.getDocument().text;
      if (offset !== text.length && text[offset] !== "\n") return offset;
      const closing = new RegExp(`${inlinePatterns().close.source.slice(1)}$`, "i").exec(text.slice(Math.max(0, offset - 2000), offset));
      return closing ? offset - closing[0].length : offset;
    };
    const placeCaret = (leaf: HTMLElement, offset: number) => {
      highlightSelection(offset, offset); leaf.focus({ preventScroll: true }); restoreVisualSelection(host, { from: offset, to: offset }, true); select();
    };
    const selectText = (event: PointerEvent, leaf: HTMLElement) => {
      event.preventDefault();
      // WebKit still starts a native selection (and places its own caret) from the following mousedown; keep it out.
      window.getSelection()?.removeAllRanges();
      host.classList.add("visual-selecting");
      const noNative = (native: Event) => native.preventDefault();
      document.addEventListener("selectstart", noNative, true);
      host.addEventListener("mousedown", noNative, { capture: true, once: true });
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
        document.removeEventListener("selectstart", noNative, true);
        host.removeEventListener("mousedown", noNative, true);
        host.classList.remove("visual-selecting");
        window.getSelection()?.removeAllRanges();
        setEditable(true);
        head = sourceOffsetAt(event.clientX, event.clientY) ?? head;
        requestAnimationFrame(() => {
          if (anchor !== null && head !== null && head !== anchor) {
            const range = { from: Math.min(anchor, head), to: Math.max(anchor, head) };
            highlightSelection(range.from, range.to); setSelectedRange(range, true); (document.activeElement as HTMLElement | null)?.blur(); host.focus({ preventScroll: true }); latest.current.onRange({ ...identity(latest.current.getDocument()), ...range });
          }
          // A click (no drag) puts the caret into the leaf it hit, even past the end of a line:
          // the jump over closing tags is only for selecting whole lines.
          else if (anchor !== null) placeCaret(leaf, insideFormatting(Math.min(Math.max(anchor, Number(leaf.dataset.sourceFrom)), Number(leaf.dataset.sourceTo))));
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
    const titleOf = (element: Element | null | undefined) => { const title = element?.querySelector(":scope > summary .spoiler-title")?.textContent?.trim(); return title ? `«${title}»` : null; };
    const describe = (slot: Slot) => {
      const spoiler = slot.parent.closest(".builder-spoiler"), inside = spoiler ? `внутрь ${titleOf(spoiler) ?? "«спойлер»"}` : "в корень документа";
      let previous = slot.before ? slot.before.previousElementSibling : slot.parent.lastElementChild;
      while (previous && (previous === ghost || previous.classList.contains("empty-insert") || previous.classList.contains("visual-drag-source"))) previous = previous.previousElementSibling;
      const after = previous?.classList.contains("builder-spoiler") ? titleOf(previous) : null;
      return `Переместить ${inside}, ${after ? `после ${after}` : previous ? "после текста" : "в начало"}`;
    };
    let insideMark: Element | null = null, lastHint: string | null = null;
    // Only a changed hint reaches React: re-rendering the app on every pointer move would drop moves.
    const hint = (text: string | null) => { if (text !== lastHint) { lastHint = text; latest.current.onDragHint?.(text); } };
    const paint = (drop: Drop | null) => {
      lastDrop = drop;
      caret.hidden = true; textGhost.hidden = true;
      insideMark?.classList.remove("drop-inside"); insideMark = null;
      if (!drop?.kind || drop.kind !== "block" || !drop.slot) ghost.remove();
      if (!drop) { hint(dragging ? "Здесь блок не изменится — отпустите в другом месте" : null); return; }
      if (drop.kind === "block" && drop.slot) {
        if (ghost.parentElement !== drop.slot.parent || ghost.nextElementSibling !== drop.slot.before) drop.slot.parent.insertBefore(ghost, drop.slot.before);
        if (drop.slot.parent.classList.contains("spoiler-body")) { insideMark = drop.slot.parent.closest(".builder-spoiler"); insideMark?.classList.add("drop-inside"); }
        hint(`${describe(drop.slot)}${host.dataset.dragCopy === "true" ? " (копия)" : ""}`);
        return;
      }
      hint(host.dataset.dragCopy === "true" ? "Скопировать в текст" : "Переместить в текст");
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
      if (payload.kind === "text") { let label = latest.current.getDocument().text.slice(payload.range.from, payload.range.to);
        for (let previous = ""; previous !== label;) { previous = label; label = label.replace(/\[[^[\]]*\]/g, ""); }
        ghostLabel = label.replace(/\s+/g, " ").trim().slice(0, 80); preview.textContent = ghostLabel; }
      else {
        // A 28px chip: tag, title and how many blocks move with it.
        const kind = payload.element.dataset.dragKind === "spoiler" ? "spoiler" : payload.element.dataset.dragKind === "item" ? "*" : payload.element.dataset.dragKind ?? "";
        const tag = document.createElement("span"); tag.className = `tag-name role-${kind === "spoiler" || kind === "list" ? "block" : "item"}`; tag.textContent = kind === "spoiler" || kind === "*" || kind === "list" ? tagFor(kind) : kind;
        const title = document.createElement("span"); title.textContent = payload.element.querySelector(":scope > summary .spoiler-title")?.textContent?.trim() || payload.element.textContent?.trim().slice(0, 60) || "";
        preview.append(tag, title);
        const count = payload.element.querySelector(":scope > summary .spoiler-count")?.textContent;
        if (count) { const small = document.createElement("small"); small.textContent = count; preview.append(small); }
      }
      ghost.replaceChildren();
      if (payload.kind === "node") { const head = payload.element.querySelector(":scope > summary"); ghost.append((head ?? payload.element).cloneNode(true)); ghost.className = `visual-drop-ghost visual-drop-ghost-${payload.element.dataset.dragKind}`; }
    };
    const movePreview = (x: number, y: number) => { preview.style.transform = `translate(${x + 14}px, ${y + 12}px)`; };
    const scroller = new EdgeAutoScroller();
    let dragging = false;
    const gesture = (event: PointerEvent, payload: Payload, onClick: () => void) => {
      const startX = event.clientX, startY = event.clientY;
      let drop: Drop | null = null, lastX = startX, lastY = startY;
      dragging = false;
      const update = (copy: boolean) => {
        host.dataset.dragCopy = String(copy); preview.dataset.copy = String(copy);
        drop = locate(payload, lastX, lastY);
        if (!copy && drop?.kind === "block" && payload.kind === "node" && (drop.at === atFrom(payload.element) || drop.at === Number(payload.element.dataset.atTo))) drop = null;
        paint(drop);
      };
      const move = (next: PointerEvent) => {
        if (!(next.buttons & 1)) return;
        lastX = next.clientX; lastY = next.clientY;
        if (!dragging) {
          if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
          // Structural moves wait until the code and the view are in sync again.
          if (payload.kind === "node" && snapshotRef.current?.revision !== latest.current.getDocument().revision) return;
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
        const wasDragging = dragging; dragging = false;
        scroller.stop(); paint(null); ghost.remove(); preview.hidden = true; setEditable(true);
        if (hoverOpen) { clearTimeout(hoverOpen.timer); hoverOpen = null; }
        host.classList.remove("visual-dragging"); delete host.dataset.dragCopy;
        if (payload.kind === "node") payload.element.classList.remove("visual-drag-source");
        if (!wasDragging) { if (end) onClick(); return; }
        const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation(); };
        window.addEventListener("click", swallow, true); setTimeout(() => window.removeEventListener("click", swallow, true), 0);
        if (end && drop) apply(payload, drop, end.ctrlKey);
      };
      const up = (end: PointerEvent) => finish(end);
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
      window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true); host.addEventListener("scroll", onScroll);
    };
    const focusEmptyArea = (body: HTMLElement, x: number, y: number) => {
      const leaves = Array.from(body.querySelectorAll<HTMLElement>(".visual-text")).filter((leaf) => leaf.closest(".spoiler-body") === body && leaf.dataset.visualEditable !== "false");
      let best: { leaf: HTMLElement; distance: number; rect: DOMRect } | null = null;
      for (const leaf of leaves) for (const rect of Array.from(leaf.getClientRects())) {
        const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        if (!best || distance < best.distance) best = { leaf, distance, rect };
      }
      if (best && best.distance < 24) {
        const offset = sourceOffsetAt(Math.max(best.rect.left + 1, Math.min(x, best.rect.right - 1)), best.rect.top + best.rect.height / 2);
        if (offset !== null) { placeCaret(best.leaf, offset); return; }
      }
      body.querySelector<HTMLButtonElement>(":scope > .empty-insert")?.click();
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
      if (element?.dataset.dragKind === "spoiler" && host.contains(element)) {
        window.getSelection()?.removeAllRanges();
        const body = summary ? null : element.querySelector<HTMLElement>(":scope > .spoiler-body");
        const x = event.clientX, y = event.clientY;
        gesture(event, { kind: "node", element }, () => { if (body) focusEmptyArea(body, x, y); });
        return;
      }
      // Empty space next to text (left of a line start, right of its end) starts a selection too.
      if (target.closest(".builder-caption, .properties, .opaque-block, .media-placeholder") || !host.contains(target)) return;
      const anchor = sourceOffsetAt(event.clientX, event.clientY);
      if (anchor === null) return;
      const distance = (item: HTMLElement) => { const from = Number(item.dataset.sourceFrom), to = Number(item.dataset.sourceTo); return anchor < from ? from - anchor : anchor > to ? anchor - to : 0; };
      const near = Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from]")).reduce<HTMLElement | null>((best, item) => !best || distance(item) < distance(best) ? item : best, null);
      if (near) selectText(event, near);
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
  // A new line typed at the end of a link starts after the link (as in word processors), not inside it.
  const pendingCaret = useRef<number | null>(null);
  const leaveLink = (to: number) => {
    const url = tagFor("url").replace(/[*-]/g, "\\$&"), document = props.getDocument(), closing = new RegExp(`^(?:\\[\\/(?!${url}\\])[^\\]\\n]+\\])*\\[\\/${url}\\]`, "i").exec(document.text.slice(to));
    if (!closing) return false;
    const at = to + closing[0].length;
    try { props.execute(textEditCommand(document, { from: at, to: at }, "\n", "")); pendingCaret.current = at + 1; } catch (error) { props.onError(String(error)); }
    return true;
  };
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !root.current || snapshot?.revision !== props.document.revision) return;
    pendingCaret.current = null;
    restoreVisualSelection(root.current, { from: at, to: at }, true);
  });
  const [paste, setPaste] = useState<{ range: SourceRange; text: string; documentId: string; revision: number } | null>(null);
  const replaceSelection = (range: SourceRange, text: string) => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    try {
      props.execute(replaceVisualRange(props.getDocument(), snapshot, range, text));
      setSelectedRange(null);
      if (typeof CSS !== "undefined") (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete("bbforge-selection");
      pendingCaret.current = range.from + text.length;
    } catch (error) { props.onError(String(error)); }
  };
  /**
   * Backspace at the start / Delete at the end of a text leaf. An empty leaf takes its empty
   * formatting with it ([url=…][/url] left after erasing a link's text); otherwise the character
   * on the other side of the tag edge goes, if it is in the same block.
   */
  const pendingEdge = useRef<{ key: "Backspace" | "Delete"; from: number; to: number; revision: number } | null>(null);
  const edgeKey = (key: "Backspace" | "Delete", from: number, to: number): boolean => {
    const document = props.getDocument(), snapshot = snapshotRef.current, host = root.current;
    if (!host) return false;
    // The structure is still being analysed after the last keystroke: do it once it is up to date.
    if (!snapshot || snapshot.revision !== document.revision || snapshot.source !== document.text) { pendingEdge.current = { key, from, to, revision: document.revision }; return true; }
    pendingEdge.current = null;
    const index = createPositionIndex(document.text);
    try {
      if (from === to) {
        const at = index.utf16ToByte(from), blank = (node: Node) => !stripTags(source.slice(index.byteToUtf16(node.contentSpan.start), index.byteToUtf16(node.contentSpan.end))).trim();
        const empty = allNodes(snapshot.analysis.nodes).filter((node) => node.kind === "element" && node.wellFormed && node.closingSpan && tagSpec(node.name)?.role === "inline" && node.contentSpan.start <= at && at <= node.contentSpan.end && blank(node))
          .sort((a, b) => (b.span.end - b.span.start) - (a.span.end - a.span.start))[0];
        if (empty) {
          const span = { from: index.byteToUtf16(empty.span.start), to: index.byteToUtf16(empty.span.end) };
          props.execute({ ...identity(document), label: "Удалить пустое оформление", changes: [{ ...span, insert: "" }], selection: { from: span.from, to: span.from } });
          pendingCaret.current = span.from;
          return true;
        }
      }
      const current = Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from]")).find((leaf) => Number(leaf.dataset.sourceFrom) === from && Number(leaf.dataset.sourceTo) === to);
      const block = (element: Element | null | undefined) => element?.closest(".spoiler-body, .builder-page, li, blockquote, pre");
      const neighbours = Array.from(host.querySelectorAll<HTMLElement>(".visual-text[data-source-from]")).filter((leaf) => leaf !== current && leaf.dataset.visualEditable !== "false" && block(leaf) === block(current))
        .map((leaf) => ({ from: Number(leaf.dataset.sourceFrom), to: Number(leaf.dataset.sourceTo) })).filter((leaf) => leaf.to > leaf.from);
      if (key === "Backspace") {
        const previous = neighbours.filter((leaf) => leaf.to <= from).sort((a, b) => b.to - a.to)[0];
        if (!previous) return false;
        const size = /[\uDC00-\uDFFF]/.test(document.text[previous.to - 1] ?? "") && previous.to - 2 >= previous.from ? 2 : 1;
        props.execute(textEditCommand(document, { from: previous.to - size, to: previous.to }, "", document.text.slice(previous.to - size, previous.to)));
        pendingCaret.current = previous.to - size;
        return true;
      }
      const next = neighbours.filter((leaf) => leaf.from >= to).sort((a, b) => a.from - b.from)[0];
      if (!next) return false;
      const size = /[\uD800-\uDBFF]/.test(document.text[next.from] ?? "") && next.from + 2 <= next.to ? 2 : 1;
      props.execute(textEditCommand(document, { from: next.from, to: next.from + size }, "", document.text.slice(next.from, next.from + size)));
      pendingCaret.current = to;
      return true;
    } catch (error) { props.onError(String(error)); return true; }
  };
  useLayoutEffect(() => {
    const pending = pendingEdge.current;
    if (!pending || snapshot?.revision !== pending.revision || props.document.revision !== pending.revision) return;
    pendingEdge.current = null;
    edgeKey(pending.key, pending.from, pending.to);
  });
  // Misspelt words: a CSS highlight over the text pieces (drawn again after every render, since
  // lazy groups and edits change which pieces exist).
  useLayoutEffect(() => {
    const registry = typeof CSS === "undefined" ? undefined : (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!registry || !HighlightCtor || !root.current) return;
    const spelling = props.spelling;
    if (!spelling || spelling.text !== props.document.text || !spelling.ranges.length) { registry.delete("bbforge-spelling"); return; }
    const ranges: Range[] = [];
    for (const leaf of Array.from(root.current.querySelectorAll<HTMLElement>(".visual-text[data-source-from][data-source-to]"))) {
      const from = Number(leaf.dataset.sourceFrom), to = Number(leaf.dataset.sourceTo), text = leaf.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) continue;
      for (const item of spelling.ranges) {
        if (item.from < from || item.to > to) continue;
        const range = document.createRange();
        range.setStart(text, item.from - from); range.setEnd(text, item.to - from);
        ranges.push(range);
      }
    }
    registry.set("bbforge-spelling", new HighlightCtor(...ranges));
  });
  useEffect(() => () => { (typeof CSS === "undefined" ? undefined : (CSS as unknown as { highlights?: Map<string, unknown> }).highlights)?.delete("bbforge-spelling"); }, []);
  const select = () => { if (root.current) { const range = readVisualSelection(root.current, props.getDocument()); if (range) { setSelectedRange(range, true); props.onRange(range); } } };
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
      return <span key={path} className="visual-text-node" {...dragTarget(reference, "text", from, to)}><TextLeaf autoFocus={path === insertionPath} literal={literal} onError={props.onError} editable={snapshot?.revision === props.document.revision} text={text} from={from} to={to} onEdit={(range, value, expected) => { try { props.execute(textEditCommand(props.getDocument(), range, value, expected)); } catch (error) { props.onError(String(error)); throw error; } }} onSelect={select} onComposition={props.onComposition} onPasteCode={(range, text) => setPaste({ range, text, ...identity(props.getDocument()) })} onEnterAtEnd={literal ? undefined : leaveLink} onEdgeKey={edgeKey} /></span>;
    }
    const reference = nodeRef(snapshot!, node);
    const spec = tagSpec(node.name), raw = !!spec?.raw;
    const structural = is(node, "spoiler", "list", "*", "quote", "code", "img", "attachment") || (!!spec && !spec.builtin && spec.role !== "inline");
    const children = () => node.children.length ? node.children.map((child, at) => render(child, `${path}.${at}`, literal || raw, structural ? undefined : reference)) : render({ kind: "text", name: null, parameter: null, span: node.contentSpan, contentSpan: node.contentSpan, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, `${path}.empty`, literal || raw, structural ? undefined : reference);
    const selectNode = (event: React.MouseEvent) => { event.stopPropagation(); const range = { from, to }; setSelectedRange(range); props.onRange({ ...identity(props.document), ...range }); props.onSelect(reference); };
    const isSelected = props.selectedSpan?.start === node.span.start && props.selectedSpan?.end === node.span.end;
    // Unknown or broken markup is inert: shown as its source with ways out, never as half-rendered content.
    if (!node.wellFormed || !isKnownTag(node.name)) return <div key={path} className={`opaque-block ${isSelected ? "is-selected" : ""}`} data-at-from={from} data-at-to={to} onClick={selectNode}><Icon name="warning" /><span className="opaque-block-text"><span>{node.wellFormed ? "Неизвестный тег" : "Повреждённая разметка"}</span><code>{source.slice(from, Math.min(to, from + 600))}{to - from > 600 ? "…" : ""}</code></span><button onClick={(event) => { event.stopPropagation(); props.onNavigate({ from, to }); }}>В коде</button>{props.onFix && <button onClick={(event) => { event.stopPropagation(); props.onFix!({ from, to }); }}>Исправить…</button>}</div>;
    if (is(node, "spoiler")) {
      const insertPath = `${path}.insert`;
      const insertAt = index.byteToUtf16(node.contentSpan.end);
      const blocks = node.children.filter((child) => child.kind === "element" || source.slice(index.byteToUtf16(child.span.start), index.byteToUtf16(child.span.end)).trim()).length;
      return <SpoilerBlock key={path} tag={node.name ?? ""} blocks={blocks} selected={isSelected} title={node.parameter ?? "Спойлер"} onRename={node.parameter !== null ? (title) => run(() => renameSpoiler(props.getDocument(), snapshotRef.current!, reference, title)) : undefined} depth={path.split(".").length - 1} dragTarget={dragTarget(reference, "spoiler", from, to)} contentEnd={insertAt} onSelect={selectNode} onInsert={() => { props.onRange({ ...identity(props.document), from: insertAt, to: insertAt }); props.onSelect(reference); setInsertionPath(insertPath); }}>{() => <>{children()}{insertionPath === insertPath && <InsertionDraft onCommit={(value) => { setInsertionPath(null); run(() => textEditCommand(props.getDocument(), { from: insertAt, to: insertAt }, value, "")); }} onCancel={() => setInsertionPath(null)} />}</>}</SpoilerBlock>;
    }
    if (is(node, "img", "attachment")) return <button key={path} className="media-placeholder" data-at-from={from} data-at-to={to} onClick={selectNode}>{is(node, "img") ? <ResolvedImage url={stripTags(source.slice(index.byteToUtf16(node.contentSpan.start), index.byteToUtf16(node.contentSpan.end)))} className="builder-thumbnail" fallback={<Icon name="image" />} /> : <Icon name="file" />}{is(node, "img") ? (stripTags(source.slice(index.byteToUtf16(node.contentSpan.start), index.byteToUtf16(node.contentSpan.end))).split(/[\\/]/).at(-1)?.split("?")[0] || "Изображение") : `Вложение ${node.parameter ?? ""}`}</button>;
    if (is(node, "code") || (raw && !spec?.render)) return <pre className="builder-code" key={path} data-at-from={from} data-at-to={to} onClick={selectNode}>{children()}</pre>;
    if (is(node, "quote")) return <blockquote key={path} data-at-from={from} data-at-to={to} onClick={selectNode}>{children()}</blockquote>;
    if (is(node, "list")) return <ul key={path} {...dragTarget(reference, "list", from, to)} onClick={selectNode}>{children()}</ul>;
    if (is(node, "*")) return <li key={path} {...dragTarget(reference, "item", from, to)} onClick={selectNode}>{children()}</li>;
    if (spec && !spec.builtin && spec.render) return <PlainTag key={path} spec={spec} value={node.parameter} data-at-from={from} data-at-to={to} onClick={selectNode}>{children()}</PlainTag>;
    const style: React.CSSProperties = {}, tag = builtinOf(node.name);
    if (tag === "b") style.fontWeight = 700;
    if (tag === "i") style.fontStyle = "italic";
    if (tag === "sub" || tag === "sup") { style.verticalAlign = tag; style.fontSize = "smaller"; }
    if (tag === "u") style.textDecoration = "underline";
    if (tag === "s") style.textDecoration = "line-through";
    if (tag === "color" && /^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(node.parameter ?? "")) style.color = node.parameter!;
    if (tag === "background" && /^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(node.parameter ?? "")) style.backgroundColor = node.parameter!;
    if (tag === "size" && /^\d+$/.test(node.parameter ?? "")) style.fontSize = `${Math.min(48, Math.max(8, Number(node.parameter) * 4))}px`;
    if (tag === "font" && /^[\w -]{1,40}$/.test(node.parameter ?? "")) style.fontFamily = node.parameter!;
    if (tag === "left" || tag === "center" || tag === "right") return <div key={path} data-at-from={from} data-at-to={to} style={{ textAlign: tag }} onClick={selectNode}>{children()}</div>;
    if (tag === "url") return <span key={path} data-at-from={from} data-at-to={to} className={safeExternalUrl(node.parameter ?? "") ? "builder-link" : ""} title={node.parameter ?? ""} onClick={selectNode}>{children()}</span>;
    return <span key={path} data-at-from={from} data-at-to={to} style={style} onClick={selectNode}>{children()}</span>;
  };
  return <div className={`builder ${snapshot?.revision === props.document.revision ? "" : "syncing"}`} aria-busy={snapshot?.revision !== props.document.revision} tabIndex={-1} ref={root} onMouseUp={select} onCopy={(event) => { if (selectedRange && selectedRange.from !== selectedRange.to) { event.preventDefault(); event.clipboardData.setData("text/plain", props.document.text.slice(selectedRange.from, selectedRange.to)); } }}
    onCut={(event) => { const range = selectionRef.current; if (!range || range.from >= range.to) return; event.preventDefault(); event.clipboardData.setData("text/plain", props.document.text.slice(range.from, range.to)); replaceSelection(range, ""); }}
    onKeyDown={(event) => {
      // A selection made with the mouse is drawn by the builder, not by the browser: keys that
      // would replace a selection have to do it here.
      if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const text = event.key === "Backspace" || event.key === "Delete" ? "" : event.key === "Enter" ? "\n" : event.key.length === 1 ? event.key : null;
      if (text === null) return;
      const range = selectionRef.current;
      if (range && range.from < range.to) { event.preventDefault(); event.stopPropagation(); replaceSelection(range, text); return; }
      // Keys pressed right after a replacement, before the caret is back in the text: they go
      // where the caret will be, so fast typing loses nothing.
      const at = pendingCaret.current;
      if (at === null || event.target !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation();
      try {
        const document = props.getDocument();
        if (event.key === "Backspace") { if (at > 0) { props.execute(textEditCommand(document, { from: at - 1, to: at }, "", document.text.slice(at - 1, at))); pendingCaret.current = at - 1; } }
        else if (event.key === "Delete") { if (at < document.text.length) props.execute(textEditCommand(document, { from: at, to: at + 1 }, "", document.text.slice(at, at + 1))); }
        else { props.execute(textEditCommand(document, { from: at, to: at }, text, "")); pendingCaret.current = at + text.length; }
      } catch (error) { props.onError(String(error)); }
    }} onScroll={(event) => props.onScrollPosition?.({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}>
    <div className="builder-page">{snapshot ? Array.from({ length: Math.ceil(snapshot.analysis.nodes.length / 30) }, (_, group) => <LazyBlockGroup key={`${props.document.id}-${group}`} eager={group === 0} count={Math.min(30, snapshot.analysis.nodes.length - group * 30)}>{() => snapshot.analysis.nodes.slice(group * 30, group * 30 + 30).map((node, at) => render(node, String(group * 30 + at)))}</LazyBlockGroup>) : <p>Анализ документа…</p>}{snapshot?.analysis.nodes.length === 0 && render({ kind: "text", name: null, parameter: null, span: { start: 0, end: 0 }, contentSpan: { start: 0, end: 0 }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] }, "empty")}</div>
    {paste && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-label="Вставить текст"><h3>В тексте найдены BBCode-теги</h3><pre>{paste.text}</pre><button onClick={() => { run(() => ({ ...paste, label: "Вставить BBCode", changes: [{ ...paste.range, insert: paste.text }] })); setPaste(null); }}>Вставить как BBCode</button><button onClick={() => { run(() => ({ ...paste, label: "Вставить буквальный текст", changes: [{ ...paste.range, insert: literalPaste(paste.text) }] })); setPaste(null); }}>Буквально в code</button><button onClick={() => setPaste(null)}>Отмена</button></section></div>}
  </div>;
}
