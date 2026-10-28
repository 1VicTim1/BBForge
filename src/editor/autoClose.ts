import { EditorView } from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { activeProfile, tagSpec } from "../bbcode/profile";

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `at` is inside a raw block ([code]…): there tags are text and brackets are code. */
export function insideRaw(text: string, at: number): boolean {
  const raw = [...activeProfile().tags.values()].filter((tag) => tag.raw).map((tag) => tag.name);
  if (!raw.length) return false;
  const before = text.slice(Math.max(0, at - 200_000), at), pattern = new RegExp(`\\[(\\/?)(${raw.map(escape).join("|")})(?:=[^\\]\\n]*)?\\]`, "gi");
  let open = false;
  for (const match of before.matchAll(pattern)) open = !match[1];
  return open;
}

/**
 * The closing tag to add after "]" that completes an opening tag before `at`, or null: not for
 * leaf and list-item tags, not inside raw blocks, and not when an unmatched closing tag of the
 * same name already follows (the user is retyping an opening tag).
 */
export function closingFor(text: string, at: number): string | null {
  const opening = /\[([A-Za-z][\w*-]*)(?:=[^\]\n]*)?$/.exec(text.slice(Math.max(0, at - 300), at));
  if (!opening) return null;
  const spec = tagSpec(opening[1]);
  if (!spec || spec.leaf || spec.role === "item" || insideRaw(text, at - opening[0].length)) return null;
  const name = escape(opening[1]), pattern = new RegExp(`\\[(\\/?)${name}(?:=[^\\]\\n]*)?\\]`, "gi");
  let depth = 0;
  for (const match of text.slice(at).matchAll(pattern)) {
    if (!match[1]) depth++;
    else if (depth === 0) return null;
    else depth--;
  }
  return `[/${opening[1]}]`;
}

/** Typing "]" of an opening tag adds its closing tag after the cursor. */
export const autoCloseTags = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "]" || view.composing || from !== to || view.state.readOnly) return false;
  const closing = closingFor(view.state.doc.toString(), from);
  if (!closing) return false;
  view.dispatch({ changes: { from, to, insert: `]${closing}` }, selection: { anchor: from + 1 }, userEvent: "input.type", scrollIntoView: true });
  return true;
});

/** Brackets and quotes close themselves inside [code], not in the BBCode around it. */
export const codeBrackets = [
  closeBrackets(),
  EditorState.languageData.of((state, at) => [{ closeBrackets: { brackets: insideRaw(state.doc.toString(), at) ? ["(", "[", "{", "\"", "'"] : [], before: ")]}:;>[" } }]),
];
