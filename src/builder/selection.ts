import type { DocumentState } from "../document/state";
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
  const selection = window.getSelection(); if (!selection) return false;
  selection.removeAllRanges(); selection.addRange(domRange);
  if (focus) start.element.focus({ preventScroll: true });
  return true;
}
export function readVisualSelection(root: HTMLElement, document: DocumentState): VisualRange | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const offset = (node: globalThis.Node, at: number): number | null => {
    const element = (node.nodeType === 1 ? node as Element : node.parentElement)?.closest<HTMLElement>("[data-source-from]");
    if (!element || !root.contains(element)) return null;
    const prefix = window.document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(node, at);
    return Number(element.dataset.sourceFrom) + prefix.toString().length;
  };
  const from = offset(range.startContainer, range.startOffset), to = offset(range.endContainer, range.endOffset);
  return from === null || to === null ? null : { from, to, documentId: document.id, revision: document.revision };
}
