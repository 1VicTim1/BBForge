import { useLayoutEffect, useRef } from "react";
import { normalizeInput } from "./input";

export function InsertionDraft({ onCommit, onCancel }: { onCommit(text: string): void; onCancel(): void }) {
  const host = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const finished = useRef(false);

  useLayoutEffect(() => {
    const input = host.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const commit = () => {
    if (finished.current || composing.current) return;
    const text = normalizeInput(host.current?.textContent ?? "");
    finished.current = true;
    if (text) onCommit(text);
    else onCancel();
  };
  const cancel = () => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  };

  return <span
    ref={host}
    className="visual-text insertion-text"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label="Новый текст спойлера"
    spellCheck={false}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; }}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
      else if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing) {
        event.preventDefault(); commit();
      }
    }}
  />;
}
