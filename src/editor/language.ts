import { foldService } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

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

function decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of tagSpans(view.state.doc.toString())) {
    builder.add(span.from, span.to, Decoration.mark({ class: `bb-${span.kind}` }));
  }
  return builder.finish();
}

const highlighting = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) { if (update.docChanged) this.decorations = decorations(update.view); }
}, { decorations: (plugin) => plugin.decorations });

export const bbcodeLanguage: Extension = [
  highlighting,
  foldService.of((state, lineStart, lineEnd) => spoilerFoldRanges(state.doc.toString()).find((range) => range.from >= lineStart && range.from <= lineEnd) ?? null),
  EditorView.baseTheme({
    ".bb-bracket": { color: "#7c8da6" },
    ".bb-name": { color: "#075f9f", fontWeight: "600" },
    ".bb-parameter": { color: "#8a4a0a" },
  }),
];
