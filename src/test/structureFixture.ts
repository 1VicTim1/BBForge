// Small fixture builder for command tests only. Production always uses Rust analysis.
import type { AnalysisSnapshot, Node, Span } from "../analysis/types";
import type { DocumentState } from "../document/state";
export function snapshotFixture(document: DocumentState): AnalysisSnapshot {
  const source = document.text;
  const byteAt = (position: number) => new TextEncoder().encode(source.slice(0, position)).length;
  const span = (start: number, end: number): Span => ({ start: byteAt(start), end: byteAt(end) });
  const roots: Node[] = [], stack: Node[] = [];
  const append = (node: Node) => (stack.at(-1)?.children ?? roots).push(node);
  let cursor = 0;
  const text = (end: number) => { if (end > cursor) append({ kind: "text", name: null, parameter: null, span: span(cursor, end), contentSpan: span(cursor, end), openingSpan: null, closingSpan: null, wellFormed: true, children: [] }); };
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== "[") continue;
    let depth = 1, end = index + 1;
    while (end < source.length && depth) { if (source[end] === "[") depth++; if (source[end] === "]") depth--; end++; }
    const raw = source.slice(index + 1, end - 1), match = /^(\/)?([\w*]+)(?:=([\s\S]*))?$/.exec(raw);
    if (!match) continue;
    text(index);
    if (match[1]) {
      const node = stack.pop();
      if (node) { node.closingSpan = span(index, end); node.contentSpan.end = byteAt(index); node.span.end = byteAt(end); node.wellFormed = node.name === match[2]; append(node); }
    } else stack.push({ kind: "element", name: match[2], parameter: match[3] ?? null, span: span(index, end), openingSpan: span(index, end), contentSpan: span(end, end), closingSpan: null, wellFormed: true, children: [] });
    cursor = end; index = end - 1;
  }
  text(source.length);
  while (stack.length) { const node = stack.pop()!; node.wellFormed = false; node.span.end = byteAt(source.length); node.contentSpan.end = byteAt(source.length); append(node); }
  return { documentId: document.id, revision: document.revision, source, analysis: { nodes: roots, diagnostics: [], tokens: [] } };
}
export function refFor(snapshot: AnalysisSnapshot, index: number) { return { documentId: snapshot.documentId, revision: snapshot.revision, span: snapshot.analysis.nodes[index].span }; }
