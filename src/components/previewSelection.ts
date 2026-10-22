import type { AnalysisSnapshot, Node as AnalysisNode } from "../analysis/types";
import type { DocumentIdentity, SourceRange } from "../document/commands";
import { createPositionIndex } from "../document/positions";
import type { DocumentState } from "../document/state";

export interface PreviewSelection extends DocumentIdentity, SourceRange {}

function boundary(container: globalThis.Node, offset: number, end: boolean): number | null {
  const element = container.nodeType === globalThis.Node.TEXT_NODE ? container.parentElement : container as Element;
  const leaf = element?.closest<HTMLElement>("[data-source-from][data-source-to]");
  if (leaf) {
    const base = Number(leaf.dataset.sourceFrom);
    if (container.nodeType === globalThis.Node.TEXT_NODE) return base + Math.min(offset, container.textContent?.length ?? 0);
    return end ? Number(leaf.dataset.sourceTo) : base;
  }
  if (container.nodeType === globalThis.Node.ELEMENT_NODE) {
    const children = (container as Element).querySelectorAll<HTMLElement>("[data-source-from][data-source-to]");
    const candidate = end ? children.item(children.length - 1) : children.item(0);
    if (candidate) return Number(candidate.dataset[end ? "sourceTo" : "sourceFrom"]);
  }
  return null;
}

export function readPreviewSelection(root: HTMLElement, document: DocumentState): PreviewSelection | null {
  const selection = window.getSelection(); if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0); if (!root.contains(range.commonAncestorContainer)) return null;
  const anchor = boundary(range.startContainer, range.startOffset, false), head = boundary(range.endContainer, range.endOffset, true);
  if (anchor === null || head === null) return null;
  return { documentId: document.id, revision: document.revision, from: Math.min(anchor, head), to: Math.max(anchor, head) };
}

export function extractPreviewBbcode(document: DocumentState, snapshot: AnalysisSnapshot, range: PreviewSelection, includeAncestors: boolean): string | null {
  if (range.documentId !== document.id || range.revision !== document.revision || snapshot.source !== document.text) return null;
  const index = createPositionIndex(document.text), from = index.utf16ToByte(range.from), to = index.utf16ToByte(range.to);
  const slice = (start: number, end: number) => document.text.slice(index.byteToUtf16(start), index.byteToUtf16(end));
  const visit = (node: AnalysisNode): string | null => {
    if (node.span.end <= from || node.span.start >= to) return "";
    if (from <= node.span.start && to >= node.span.end) return slice(node.span.start, node.span.end);
    if (node.kind === "text") return slice(Math.max(from, node.span.start), Math.min(to, node.span.end));
    const inner = node.children.map(visit);
    if (inner.some((value) => value === null)) return null;
    const content = inner.join("");
    if (!includeAncestors) return content;
    if (!node.wellFormed || !node.openingSpan || !node.closingSpan) return null;
    return slice(node.openingSpan.start, node.openingSpan.end) + content + slice(node.closingSpan.start, node.closingSpan.end);
  };
  const parts = snapshot.analysis.nodes.map(visit);
  return parts.some((value) => value === null) ? null : parts.join("");
}
