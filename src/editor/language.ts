
export type TagSpanKind = "bracket" | "name" | "parameter";
export interface TagSpan { from: number; to: number; kind: TagSpanKind }
export interface FoldRange { from: number; to: number }

const tagPattern = /\[(\/?)(([a-zA-Z0-9*_-]+))([^\]]*)\]/g;

export function tagSpans(source: string): TagSpan[] {
  const spans: TagSpan[] = [];
  for (const match of source.matchAll(tagPattern)) {
    const from = match.index;
    const slashLength = match[1].length;
    const nameFrom = from + 1 + slashLength;
    const nameTo = nameFrom + match[3].length;
    spans.push({ from, to: nameFrom, kind: "bracket" });
    spans.push({ from: nameFrom, to: nameTo, kind: "name" });
    if (match[4]) spans.push({ from: nameTo, to: from + match[0].length - 1, kind: "parameter" });
    spans.push({ from: from + match[0].length - 1, to: from + match[0].length, kind: "bracket" });
  }
  return spans;
}

export function spoilerFoldRanges(source: string): FoldRange[] {
  const stack: Array<{ contentFrom: number; order: number }> = [];
  const ranges: Array<FoldRange & { order: number }> = [];
  let order = 0;
  const pattern = /\[(\/?)spoiler(?:=[^\]]*)?\]/gi;
  for (const match of source.matchAll(pattern)) {
    if (!match[1]) stack.push({ contentFrom: match.index + match[0].length, order: order++ });
    else {
      const opening = stack.pop();
      if (opening && opening.contentFrom < match.index) ranges.push({ from: opening.contentFrom, to: match.index, order: opening.order });
    }
  }
  return ranges.sort((left, right) => left.order - right.order).map(({ from, to }) => ({ from, to }));
}

/** Role-based highlighting (inline, block, media tags, values, URLs, unknown tags); colours live in theme.css. */
export { bbcodeHighlighting as bbcodeLanguage } from "./highlight";
