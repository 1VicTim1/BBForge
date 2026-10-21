import { useLayoutEffect, useRef } from "react";
import type { SourceRange } from "../document/commands";
import { normalizeInput } from "./input";
interface Props {
  text: string; from: number; to: number;
  onEdit(range: SourceRange, text: string): void;
  onSelect(): void; onPasteCode(range: SourceRange, text: string): void;
  onComposition(active: boolean): void;
}
export function TextLeaf(props: Props) {
  const host = useRef<HTMLSpanElement>(null), composing = useRef(false), focused = useRef(false);
  const state = useRef({ text: props.text, from: props.from, to: props.to });
  useLayoutEffect(() => {
    if (composing.current || (focused.current && state.current.text === props.text)) return;
    state.current = { text: props.text, from: props.from, to: props.to };
    if (host.current && host.current.textContent !== props.text) host.current.textContent = props.text;
  }, [props.text, props.from, props.to]);
  const commit = () => {
    const text = normalizeInput(host.current?.innerText ?? host.current?.textContent ?? "");
    if (composing.current || text === state.current.text) return;
    const current = state.current;
    props.onEdit({ from: current.from, to: current.to }, text);
    state.current = { ...current, to: current.from + text.length, text };
  };
  return <span ref={host} className="visual-text" contentEditable suppressContentEditableWarning role="textbox" aria-label="Текст блока" data-source-from={props.from} data-source-to={props.to} spellCheck={false}
    onFocus={() => { focused.current = true; }} onBlur={() => { commit(); focused.current = false; props.onSelect(); }}
    onMouseUp={props.onSelect} onKeyUp={props.onSelect}
    onCompositionStart={() => { composing.current = true; props.onComposition(true); }}
    onCompositionEnd={() => { composing.current = false; commit(); props.onComposition(false); }}
    onInput={commit}
    onBeforeInput={(event) => {
      const native = event.nativeEvent as InputEvent;
      if (native.inputType === "insertParagraph" || native.inputType === "insertLineBreak") {
        event.preventDefault(); const selection = window.getSelection();
        if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); const text = window.document.createTextNode("\n"); range.insertNode(text); range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); commit(); }
      }
    }}
    onPaste={(event) => {
      event.preventDefault(); const text = normalizeInput(event.clipboardData.getData("text/plain"));
      const selection = window.getSelection(); if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!host.current?.contains(range.commonAncestorContainer)) return;
      if (/\[[\s\S]*?\]/.test(text)) { props.onPasteCode({ from: state.current.from, to: state.current.to }, text); return; }
      range.deleteContents(); const node = window.document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); commit();
    }} />;
}
