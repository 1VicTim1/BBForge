/**
 * The builder's editing model: every text flow (the page, a spoiler's body) is one editing host,
 * so the caret, Shift+arrows and selections cross formatting freely. The browser never changes
 * the page itself: each input is turned into an edit of the BBCode source, and the caret is put
 * back by source position. These helpers map between DOM positions and source offsets through
 * the text pieces (".visual-text[data-source-from][data-source-to]").
 */

export interface Leaf { element: HTMLElement; from: number; to: number }

export const leafSelector = ".visual-text[data-source-from][data-source-to]";
export const leafOf = (element: HTMLElement): Leaf => ({ element, from: Number(element.dataset.sourceFrom), to: Number(element.dataset.sourceTo) });
export const leavesIn = (root: Element): Leaf[] => Array.from(root.querySelectorAll<HTMLElement>(leafSelector)).filter((element) => !element.closest(".insertion-text")).map(leafOf);
/** The text a piece shows (a trailing line break is drawn with a sentinel <br>). */
export const leafText = (element: HTMLElement) => element.firstChild?.nodeType === Node.TEXT_NODE ? element.firstChild.textContent ?? "" : "";
/** What each piece was last drawn with: anything else in it was typed by an input method. */
export const renderedText = new WeakMap<HTMLElement, string>();
/** Pieces that straddle an edit the analysis has not caught up with yet show outdated text. */
export const isStale = (leaf: Leaf) => leaf.element.dataset.stale === "true";
/** Whether a piece shows exactly what the document has there (it may lag behind while the analysis runs). */
export const consistent = (leaf: Leaf, text: string) => !isStale(leaf) && leafText(leaf.element) === text.slice(leaf.from, leaf.to);

/** Source offset of a DOM boundary point: inside a piece, or the nearest piece after (else before) it. */
export function domToSource(root: Element, node: globalThis.Node, offset: number): number | null {
  const element = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest<HTMLElement>(leafSelector);
  if (element && root.contains(element)) {
    const leaf = leafOf(element);
    if (node.nodeType === Node.TEXT_NODE) return leaf.from + Math.min(offset, leafText(element).length);
    return offset === 0 ? leaf.from : leaf.to;
  }
  const leaves = leavesIn(root);
  if (!leaves.length) return null;
  const point = document.createRange();
  try { point.setStart(node, offset); } catch { return null; }
  const after = leaves.find((leaf) => point.comparePoint(leaf.element, 0) >= 0);
  if (after) return after.from;
  return leaves.at(-1)!.to;
}

/** Source range of the current DOM selection inside the root, if any. */
export function selectionToSource(root: Element): { from: number; to: number; leaf: Leaf | null } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = domToSource(root, range.startContainer, range.startOffset), end = domToSource(root, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  const element = (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement)?.closest<HTMLElement>(leafSelector);
  return { from: Math.min(start, end), to: Math.max(start, end), leaf: element && root.contains(element) ? leafOf(element) : null };
}

/** The piece that holds a source range entirely, preferring the one the caret is in. */
export function leafHolding(root: Element, from: number, to: number, preferred?: Leaf | null): Leaf | null {
  if (preferred && preferred.from <= from && to <= preferred.to) return preferred;
  return leavesIn(root).find((leaf) => leaf.from <= from && to <= leaf.to) ?? null;
}

/** Puts the caret (or a selection) at source offsets; false when no piece shows that place. */
export function placeSelection(root: Element, from: number, to = from, preferred?: HTMLElement | null): boolean {
  const leaves = leavesIn(root).filter((leaf) => !isStale(leaf));
  const locate = (offset: number) => {
    const own = preferred && leaves.find((item) => item.element === preferred && item.from <= offset && offset <= item.to);
    const leaf = own || leaves.find((item) => item.from <= offset && offset <= item.to);
    if (!leaf) return null;
    const text = leaf.element.firstChild;
    return text?.nodeType === Node.TEXT_NODE ? { node: text, offset: Math.min(offset - leaf.from, text.textContent?.length ?? 0), leaf } : { node: leaf.element, offset: 0, leaf };
  };
  const start = locate(from), end = from === to ? start : locate(to);
  if (!start || !end) return false;
  const host = start.leaf.element.closest<HTMLElement>("[contenteditable='true']");
  if (host && document.activeElement !== host) host.focus({ preventScroll: true });
  const range = document.createRange();
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges(); selection?.addRange(range);
  return true;
}

/** Length of the character before or after an offset (surrogate pairs count as one character). */
export function characterSize(text: string, offset: number, direction: "backward" | "forward"): number {
  if (direction === "backward") return offset >= 2 && /[\uDC00-\uDFFF]/.test(text[offset - 1] ?? "") && /[\uD800-\uDBFF]/.test(text[offset - 2] ?? "") ? 2 : 1;
  return /[\uD800-\uDBFF]/.test(text[offset] ?? "") && /[\uDC00-\uDFFF]/.test(text[offset + 1] ?? "") ? 2 : 1;
}

/** Whether a caret is where typing can go: in a piece's text, or in an empty piece. */
export function caretInText(root: Element, node: globalThis.Node | null | undefined): boolean {
  if (!node || !root.contains(node)) return false;
  if (node.nodeType === Node.TEXT_NODE) return !!node.parentElement?.matches(leafSelector);
  return node instanceof HTMLElement && node.matches(leafSelector) && !leafText(node);
}

/** An offset in `before`, moved to where it is in `after` (one changed region between them). */
export function mapOffset(before: string, after: string, at: number): number {
  if (before === after) return at;
  let start = 0, oldEnd = before.length, newEnd = after.length;
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (at <= start) return at;
  return at >= oldEnd ? at + newEnd - oldEnd : newEnd;
}
