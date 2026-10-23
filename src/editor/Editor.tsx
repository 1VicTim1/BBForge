import { historyKeymap, defaultKeymap, undo, redo } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { Decoration, drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { useEffect, useLayoutEffect, useRef } from "react";
import { bbcodeLanguage } from "./language";
import { decodeDocument, type DocumentState, type LineEnding } from "../document/state";
import { createEditorController, createEditorState, type EditorController } from "./controller";
import type { SourceRange } from "../document/commands";
import type { AnalysisSnapshot } from "../analysis/types";
import type { ScrollPosition } from "../workspace/session";
import { allNodes } from "../document/formatting";
import { createPositionIndex } from "../document/positions";
export interface SelectionRequest extends SourceRange { nonce: number }
const refreshMatching = StateEffect.define<null>();
const matchMark = Decoration.mark({ class: "cm-matchingTag" });
/** Highlights the opening and closing tag of the element under the cursor, like an IDE's tag matching. */
function matchingTags(snapshot: () => AnalysisSnapshot | null | undefined) {
  let cached: { snapshot: AnalysisSnapshot; tags: Array<{ open: SourceRange; close: SourceRange }> } | null = null;
  const tagsOf = (current: AnalysisSnapshot) => {
    if (cached?.snapshot === current) return cached.tags;
    const index = createPositionIndex(current.source);
    const tags = allNodes(current.analysis.nodes).filter((node) => node.openingSpan && node.closingSpan).map((node) => ({
      open: { from: index.byteToUtf16(node.openingSpan!.start), to: index.byteToUtf16(node.openingSpan!.end) },
      close: { from: index.byteToUtf16(node.closingSpan!.start), to: index.byteToUtf16(node.closingSpan!.end) },
    }));
    cached = { snapshot: current, tags };
    return tags;
  };
  const build = (view: EditorView): DecorationSet => {
    const current = snapshot();
    if (!current || current.source.length !== view.state.doc.length || current.source !== view.state.doc.toString()) return Decoration.none;
    const { from, to } = view.state.selection.main, inside = (range: SourceRange) => from >= range.from && to <= range.to;
    const match = tagsOf(current).filter((tag) => inside(tag.open) || inside(tag.close)).at(-1);
    return match ? Decoration.set([matchMark.range(match.open.from, match.open.to), matchMark.range(match.close.from, match.close.to)]) : Decoration.none;
  };
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshMatching)))) this.decorations = build(update.view);
    }
  }, { decorations: (plugin) => plugin.decorations });
}
interface EditorProps {
  value: string; endings: LineEnding[]; document?: DocumentState;
  onChange(documentId: string, value: string, endings: LineEnding[]): void;
  onReady?(controller: EditorController | null): void; onSelection?(range: SourceRange): void;
  selectionRequest?: SelectionRequest;
  snapshot?: AnalysisSnapshot | null;
  storedSelection?: SourceRange;
  scroll?: ScrollPosition;
  onScrollPosition?(position: ScrollPosition): void;
}
export function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const controllerRef = useRef<EditorController | null>(null), viewRef = useRef<EditorView | null>(null);
  const composing = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    const initial = props.document ?? { ...decodeDocument(new TextEncoder().encode(props.value)), endings: props.endings };
    const extensions = [
      lineNumbers(), drawSelection(), highlightActiveLine(), bracketMatching(), foldGutter(), bbcodeLanguage, matchingTags(() => latest.current.snapshot),
      foldService.of((state, lineStart, lineEnd) => {
        const snapshot = latest.current.snapshot;
        if (!snapshot || snapshot.source !== state.doc.toString()) return null;
        const index = createPositionIndex(snapshot.source);
        const node = allNodes(snapshot.analysis.nodes).find((node) => node.name === "spoiler" && node.wellFormed && index.byteToUtf16(node.contentSpan.start) >= lineStart && index.byteToUtf16(node.contentSpan.start) <= lineEnd && node.contentSpan.start < node.contentSpan.end);
        return node ? { from: index.byteToUtf16(node.contentSpan.start), to: index.byteToUtf16(node.contentSpan.end) } : null;
      }),
      placeholder("Вставьте BBCode шапки…"), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]), EditorView.lineWrapping,
      EditorView.domEventHandlers({
        compositionstart() { composing.current = true; return false; },
        compositionend() { composing.current = false; return false; },
        keydown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing || view.composing) return false;
        const key = event.key.toLowerCase();
        if (event.code === "KeyZ" && key !== "z") { event.preventDefault(); if (event.shiftKey) redo(view); else undo(view); return true; }
        if (event.code === "KeyA" && key !== "a") { event.preventDefault(); view.dispatch({ selection: { anchor: 0, head: view.state.doc.length }, scrollIntoView: true }); return true; }
        if (event.code === "KeyC" && key !== "c") {
          const range = view.state.selection.main;
          if (range.empty) return false;
          event.preventDefault();
          const value = view.state.sliceDoc(range.from, range.to);
          void navigator.clipboard?.writeText(value).catch(() => document.execCommand("copy"));
          return true;
        }
        return false;
      } }),
      EditorView.updateListener.of((update) => { if (update.view.hasFocus && (update.selectionSet || update.docChanged)) latest.current.onSelection?.({ from: update.state.selection.main.from, to: update.state.selection.main.to }); }),
      EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "JetBrains Mono, Consolas, monospace" } }),
    ];
    const stateFor = (document: DocumentState) => createEditorState(document, extensions, (text, endings) => latest.current.onChange(document.id, text, endings), latest.current.storedSelection);
    const view = new EditorView({ parent: host.current, state: stateFor(initial) }); viewRef.current = view;
    const scroll = () => latest.current.onScrollPosition?.({ top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft });
    view.scrollDOM.addEventListener("scroll", scroll, { passive: true });
    const controller = createEditorController(view, () => latest.current.document ?? initial, stateFor, () => composing.current);
    controllerRef.current = controller; latest.current.onReady?.(controller);
    return () => { view.scrollDOM.removeEventListener("scroll", scroll); latest.current.onReady?.(null); controllerRef.current = null; view.destroy(); };
  }, []);
  useLayoutEffect(() => {
    if (!props.document) return;
    controllerRef.current?.activate(props.document.id, props.document, props.scroll);
  }, [props.document?.id]);
  useEffect(() => { if (props.selectionRequest) controllerRef.current?.select(props.selectionRequest); }, [props.selectionRequest]);
  useEffect(() => { viewRef.current?.dispatch({ effects: refreshMatching.of(null) }); }, [props.snapshot]);
  return <div ref={host} className="editor" role="textbox" aria-label="Редактор BBCode" />;
}
