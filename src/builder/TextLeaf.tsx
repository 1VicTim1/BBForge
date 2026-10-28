import { useLayoutEffect, useRef } from "react";
import { renderedText } from "./editing";

/**
 * A run of text of the document. It is not editable by itself: the page (or a spoiler's body) it
 * sits in is the editing area, and the builder turns every input into an edit of the source.
 * Its content is written here rather than by React, so text an input method typed into it can be
 * read back and replaced safely.
 */
export function TextLeaf({ text, from, to, literal, stale }: { text: string; from: number; to: number; literal?: boolean; stale?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || element.closest("[data-composing]")) return;
    // A trailing line break needs something after it to take up a line.
    const sentinel = text.endsWith("\n"), nodes = element.childNodes, last = nodes[nodes.length - 1];
    const intact = nodes.length === (text ? 1 : 0) + (sentinel ? 1 : 0)
      && (!text || (nodes[0].nodeType === Node.TEXT_NODE && nodes[0].textContent === text))
      && (!sentinel || (last instanceof HTMLElement && last.dataset.editorSentinel === "true"));
    if (!intact) {
      const children: globalThis.Node[] = [];
      if (text) children.push(document.createTextNode(text));
      if (sentinel) { const br = document.createElement("br"); br.dataset.editorSentinel = "true"; children.push(br); }
      element.replaceChildren(...children);
    }
    renderedText.set(element, text);
  });
  return <span ref={host} className="visual-text" role="textbox" aria-label="Текст блока" data-source-from={from} data-source-to={to} data-literal={literal ? "true" : undefined} data-stale={stale ? "true" : undefined} />;
}
