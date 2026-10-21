import { history, historyKeymap, defaultKeymap, invertedEffects } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { bbcodeLanguage } from "./language";
import type { LineEnding, TextChange } from "../document/state";
import { applyChanges, decodeDocument } from "../document/state";

export interface SelectionRequest { from: number; to: number; nonce: number }
interface EditorProps { value: string; endings: LineEnding[]; onChange(value: string, endings: LineEnding[], changes: TextChange[]): void; selectionRequest?: SelectionRequest }
const setEditorEndings = StateEffect.define<LineEnding[]>();

export function Editor({ value, endings, onChange, selectionRequest }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const applyingExternal = useRef(false);
  const changeHandler = useRef(onChange);
  const endingsRef = useRef(endings);
  const endingFieldRef = useRef<StateField<LineEnding[]> | null>(null);
  changeHandler.current = onChange;
  endingsRef.current = endings;

  useEffect(() => {
    if (!host.current) return;
    let endingField: StateField<LineEnding[]>;
    endingField = StateField.define({
      create: () => [...endingsRef.current],
      update: (current, transaction) => {
        const explicit = transaction.effects.find((effect) => effect.is(setEditorEndings));
        if (explicit) return [...explicit.value];
        if (!transaction.docChanged) return current;
        const changes: TextChange[] = [];
        transaction.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => changes.push({ from, to, insert: inserted.toString() }));
        const snapshot = { ...decodeDocument(new TextEncoder().encode(transaction.startState.doc.toString())), endings: current };
        return applyChanges(snapshot, changes).endings;
      },
    });
    endingFieldRef.current = endingField;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(), foldGutter(), bbcodeLanguage,
          placeholder("Вставьте BBCode шапки…"),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
          EditorView.lineWrapping,
          endingField,
          invertedEffects.of((transaction) => transaction.docChanged ? [setEditorEndings.of(transaction.startState.field(endingField))] : []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || applyingExternal.current) return;
            const changes: TextChange[] = [];
            update.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => changes.push({ from, to, insert: inserted.toString() }));
            changeHandler.current(update.state.doc.toString(), update.state.field(endingField), changes);
          }),
          EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "JetBrains Mono, Consolas, monospace" } }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { viewRef.current = null; endingFieldRef.current = null; view.destroy(); };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    const endingField = endingFieldRef.current;
    if (!view || !endingField || view.state.doc.toString() === value) return;
    applyingExternal.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, effects: setEditorEndings.of(endings), annotations: Transaction.addToHistory.of(false) });
    applyingExternal.current = false;
  }, [value, endings]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !selectionRequest) return;
    view.dispatch({ selection: { anchor: selectionRequest.from, head: selectionRequest.to }, scrollIntoView: true });
    view.focus();
  }, [selectionRequest]);

  return <div ref={host} className="editor" role="textbox" aria-label="Редактор BBCode" />;
}
