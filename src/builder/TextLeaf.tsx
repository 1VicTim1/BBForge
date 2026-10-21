import { useLayoutEffect, useRef } from "react";
import type { SourceRange } from "../document/commands";
import { normalizeInput } from "./input";
interface Props {
  text: string; from: number; to: number;
  editable?: boolean;
  onEdit(range: SourceRange, text: string, expected: string): void;
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
    const text = normalizeInput(host.current?.textContent ?? "");
    if (composing.current || text === state.current.text) return;
    const current = state.current;
    try {
      props.onEdit({ from: current.from, to: current.to }, text, current.text);
      state.current = { ...current, to: current.from + text.length, text };
    } catch { if (host.current) host.current.textContent = current.text; }
  };
  const insertText = (value: string) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!host.current?.contains(range.commonAncestorContainer)) return;
    range.deleteContents(); const text = window.document.createTextNode(value); range.insertNode(text);
    if (host.current.textContent?.endsWith("\n") && !host.current.querySelector("[data-editor-sentinel]")) { const sentinel = window.document.createElement("br"); sentinel.dataset.editorSentinel = "true"; host.current.append(sentinel); }
    range.setStart(text, text.length); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); commit();
  };
  return <span ref={host} className="visual-text" contentEditable={props.editable !== false || focused.current} suppressContentEditableWarning role="textbox" aria-label="Текст блока" data-source-from={props.from} data-source-to={props.to} spellCheck={false}
    onFocus={() => { focused.current = true; }} onBlur={() => { commit(); focused.current = false; props.onSelect(); }}
    onMouseUp={props.onSelect} onKeyUp={props.onSelect}
    onCompositionStart={() => { composing.current = true; props.onComposition(true); }}
    onCompositionEnd={() => { composing.current = false; commit(); props.onComposition(false); }}
    onInput={commit}
    onKeyDown={(event) => { if (event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); insertText("\n"); } }}
    onBeforeInput={(event) => {
      const native = event.nativeEvent as InputEvent;
      if (native.inputType === "insertParagraph" || native.inputType === "insertLineBreak") {
        event.preventDefault(); insertText("\n");
      }
    }}
    onPaste={(event) => {
      event.preventDefault(); const text = normalizeInput(event.clipboardData.getData("text/plain"));
      const selection = window.getSelection(); if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!host.current?.contains(range.commonAncestorContainer)) return;
      if (/\[[\s\S]*?\]/.test(text)) {
        const before = window.document.createRange(); before.selectNodeContents(host.current); before.setEnd(range.startContainer, range.startOffset);
        const start = state.current.from + before.toString().length;
        props.onPasteCode({ from: start, to: start + range.toString().length }, text); return;
      }
      range.deleteContents(); const node = window.document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); commit();
    }} />;
}
