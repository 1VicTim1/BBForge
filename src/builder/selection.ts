import type { DocumentIdentity, SourceRange } from "../document/commands";
export interface VisualRange extends DocumentIdentity, SourceRange {}
function point(root: HTMLElement, offset: number): { node: globalThis.Node; offset: number; element: HTMLElement } | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-source-from][data-source-to]"));
  const element = elements.find((item) => Number(item.dataset.sourceFrom) <= offset && offset <= Number(item.dataset.sourceTo));
  if (!element) return null;
  let remaining = Math.max(0, offset - Number(element.dataset.sourceFrom));
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining, element };
    remaining -= length; node = walker.nextNode();
  }
  return { node: element, offset: element.childNodes.length, element };
}
export function restoreVisualSelection(root: HTMLElement, range: SourceRange, focus = false): boolean {
  const start = point(root, range.from), end = point(root, range.to);
  if (!start || !end) return false;
  const domRange = document.createRange();
  domRange.setStart(start.node, start.offset); domRange.setEnd(end.node, end.offset);
  // The text sits in an editing area (the page, a spoiler's body): that is what takes the focus.
  if (focus) (start.element.closest<HTMLElement>("[contenteditable='true']") ?? start.element).focus({ preventScroll: true });
  const selection = window.getSelection(); if (!selection) return false;
  selection.removeAllRanges(); selection.addRange(domRange);
  return true;
}
