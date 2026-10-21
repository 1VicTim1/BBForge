import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { bbcodeLanguage } from "./language";

interface EditorProps { value: string; onChange(value: string): void }

export function Editor({ value, onChange }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
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
          EditorView.updateListener.of((update) => { if (update.docChanged) changeHandler.current(update.state.doc.toString()); }),
          EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "JetBrains Mono, Consolas, monospace" } }),
        ],
      }),
    });
    return () => view.destroy();
  }, []);

  return <div ref={host} className="editor" role="textbox" aria-label="Редактор BBCode" />;
}
