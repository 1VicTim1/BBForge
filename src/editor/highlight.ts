import { StateEffect, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { SAFE_COLOR, tagRole } from "../bbcode/tags";
import { builtinOf, namesFor } from "../bbcode/profile";

/** Highlight classes; their colours live in theme.css as CSS variables, so a theme switch needs no reconfiguration. */
export type HighlightKind = "bracket" | "inline" | "block" | "media" | "item" | "value" | "url" | "unknown";
export interface HighlightSpan { from: number; to: number; kind: HighlightKind }
export interface ColorSwatch { at: number; color: string }

// A tag whose parameter has no nested brackets: [b], [/b], [color=red], [url="https://…"].
const tagPattern = /\[(\/?)([a-zA-Z0-9*_-]+)(=[^[\]\n]*)?\]/g;
// The opening of a tag whose parameter holds tags itself: [spoiler=[b]…[/b]].
const nestedOpening = /\[([a-zA-Z0-9_-]+)(=)(?=\[)/g;
const urlLike = /^["']?(?:https?:|mailto:|ftp:|www\.|\/\/)/i;

export function highlightSpans(source: string): { spans: HighlightSpan[]; swatches: ColorSwatch[] } {
  const spans: HighlightSpan[] = [], swatches: ColorSwatch[] = [];
  const media = namesFor("img").map((name) => name.replace(/[*-]/g, "\\$&")).join("|");
  const mediaContent = media ? new RegExp(`\\[(${media})\\]([^[\\n]*)\\[\\/\\1\\]`, "gi") : null;
  for (const match of source.matchAll(nestedOpening)) {
    const from = match.index, nameTo = from + 1 + match[1].length;
    const role = tagRole(match[1]);
    if (role === "unknown") { spans.push({ from, to: nameTo + 1, kind: "unknown" }); continue; }
    spans.push({ from, to: from + 1, kind: "bracket" }, { from: from + 1, to: nameTo, kind: role }, { from: nameTo, to: nameTo + 1, kind: "bracket" });
  }
  for (const match of source.matchAll(tagPattern)) {
    const from = match.index, to = from + match[0].length, name = match[2], role = tagRole(name);
    if (role === "unknown") { spans.push({ from, to, kind: "unknown" }); continue; }
    const nameFrom = from + 1 + match[1].length, nameTo = nameFrom + name.length;
    spans.push({ from, to: nameFrom, kind: "bracket" }, { from: nameFrom, to: nameTo, kind: role });
    const parameter = match[3];
    if (parameter) {
      const value = parameter.slice(1), valueFrom = nameTo + 1;
      spans.push({ from: nameTo, to: valueFrom, kind: "bracket" });
      if (value) spans.push({ from: valueFrom, to: to - 1, kind: builtinOf(name) === "url" || urlLike.test(value) ? "url" : "value" });
      const bare = value.replace(/^["']|["']$/g, "");
      if ((builtinOf(name) === "color" || builtinOf(name) === "background") && SAFE_COLOR.test(bare)) swatches.push({ at: valueFrom, color: bare });
    }
    spans.push({ from: to - 1, to, kind: "bracket" });
    // The "]" that closes a nested parameter right after its last closing tag.
    if (match[1] && source[to] === "]") spans.push({ from: to, to: to + 1, kind: "bracket" });
  }
  if (mediaContent) for (const match of source.matchAll(mediaContent)) {
    const from = match.index + match[1].length + 2;
    if (match[2]) spans.push({ from, to: from + match[2].length, kind: "url" });
  }
  spans.sort((left, right) => left.from - right.from || left.to - right.to);
  return { spans, swatches };
}

class SwatchWidget extends WidgetType {
  constructor(readonly color: string) { super(); }
  eq(other: SwatchWidget) { return other.color === this.color; }
  toDOM() { const swatch = document.createElement("span"); swatch.className = "bb-swatch"; swatch.style.backgroundColor = this.color; swatch.setAttribute("aria-hidden", "true"); return swatch; }
  ignoreEvent() { return false; }
}

const marks = Object.fromEntries((["bracket", "inline", "block", "media", "item", "value", "url", "unknown"] as const).map((kind) => [kind, Decoration.mark({ class: `bb-${kind}` })])) as Record<HighlightKind, Decoration>;
function decorations(view: EditorView): DecorationSet {
  const { spans, swatches } = highlightSpans(view.state.doc.toString());
  const ranges = [];
  let previous = -1;
  for (const span of spans) {
    if (span.from < previous) continue; // overlapping patterns keep the first span
    ranges.push(marks[span.kind].range(span.from, span.to));
    previous = span.to;
  }
  for (const swatch of swatches) ranges.push(Decoration.widget({ widget: new SwatchWidget(swatch.color), side: -1 }).range(swatch.at));
  return Decoration.set(ranges, true);
}

/** Dispatched when the forum profile changes: the same text gets other tag colours. */
export const refreshHighlighting = StateEffect.define<null>();
export const bbcodeHighlighting: Extension = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshHighlighting)))) this.decorations = decorations(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });
