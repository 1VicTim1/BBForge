import { historyKeymap, defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { bbcodeLanguage } from "./language";
import { decodeDocument, type DocumentState, type LineEnding } from "../document/state";
import { createEditorController, createEditorState, type EditorController } from "./controller";
import type { SourceRange } from "../document/commands";
import type { AnalysisSnapshot } from "../analysis/types";
import { allNodes } from "../document/formatting";
import { createPositionIndex } from "../document/positions";
export interface SelectionRequest extends SourceRange { nonce: number }
interface EditorProps {
  value: string; endings: LineEnding[]; document?: DocumentState;
  onChange(value: string, endings: LineEnding[]): void;
  onReady?(controller: EditorController | null): void; onSelection?(range: SourceRange): void;
  selectionRequest?: SelectionRequest;
  snapshot?: AnalysisSnapshot | null;
}
export function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const controllerRef = useRef<EditorController | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const initial = props.document ?? { ...decodeDocument(new TextEncoder().encode(props.value)), endings: props.endings };
    const view = new EditorView({ parent: host.current, state: createEditorState(initial, [
      lineNumbers(), drawSelection(), highlightActiveLine(), bracketMatching(), foldGutter(), bbcodeLanguage,
      foldService.of((state, lineStart, lineEnd) => {
        const snapshot = latest.current.snapshot;
        if (!snapshot || snapshot.source !== state.doc.toString()) return null;
        const index = createPositionIndex(snapshot.source);
        const node = allNodes(snapshot.analysis.nodes).find((node) => node.name === "spoiler" && node.wellFormed && index.byteToUtf16(node.contentSpan.start) >= lineStart && index.byteToUtf16(node.contentSpan.start) <= lineEnd && node.contentSpan.start < node.contentSpan.end);
        return node ? { from: index.byteToUtf16(node.contentSpan.start), to: index.byteToUtf16(node.contentSpan.end) } : null;
      }),
      placeholder("Вставьте BBCode шапки…"), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]), EditorView.lineWrapping,
      EditorView.updateListener.of((update) => { if (update.view.hasFocus && (update.selectionSet || update.docChanged)) latest.current.onSelection?.({ from: update.state.selection.main.from, to: update.state.selection.main.to }); }),
      EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "JetBrains Mono, Consolas, monospace" } }),
    ], (text, endings) => latest.current.onChange(text, endings)) });
    const controller = createEditorController(view, () => latest.current.document ?? initial);
    controllerRef.current = controller; latest.current.onReady?.(controller);
    return () => { latest.current.onReady?.(null); controllerRef.current = null; view.destroy(); };
  }, []);
  useEffect(() => { if (props.selectionRequest) controllerRef.current?.select(props.selectionRequest); }, [props.selectionRequest]);
  return <div ref={host} className="editor" role="textbox" aria-label="Редактор BBCode" />;
}
