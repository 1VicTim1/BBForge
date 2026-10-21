import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { bbcodeLanguage } from "./language";

export interface SelectionRequest { from: number; to: number; nonce: number }
interface EditorProps { value: string; onChange(value: string): void; selectionRequest?: SelectionRequest }

export function Editor({ value, onChange, selectionRequest }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingExternal = useRef(false);
  const changeHandler = useRef(onChange);
  changeHandler.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(), foldGutter(), bbcodeLanguage,
          placeholder("Вставьте BBCode шапки…"),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => { if (update.docChanged && !applyingExternal.current) changeHandler.current(update.state.doc.toString()); }),
          EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "JetBrains Mono, Consolas, monospace" } }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    applyingExternal.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    applyingExternal.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !selectionRequest) return;
    view.dispatch({ selection: { anchor: selectionRequest.from, head: selectionRequest.to }, scrollIntoView: true });
    view.focus();
  }, [selectionRequest]);

  return <div ref={host} className="editor" role="textbox" aria-label="Редактор BBCode" />;
}
