import type { DocumentState } from "../document/state";
import type { DocumentIdentity, SourceRange } from "../document/commands";
export interface VisualRange extends DocumentIdentity, SourceRange {}
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
