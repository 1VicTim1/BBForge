// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import { createEditorController, createEditorState } from "./controller";
import { decodeDocument, serializeDocument, updateDocumentText } from "../document/state";

it("shares multi-range commands and undo/redo with exact mixed endings", () => {
  let document = decodeDocument(new TextEncoder().encode("a\r\nб\nc\r\n"));
  const original = serializeDocument(document);
  const view = new EditorView({ state: createEditorState(document, [], (text, endings) => { document = updateDocumentText(document, text, endings); }) });
  const controller = createEditorController(view, () => document);
  controller.execute({ documentId: document.id, revision: document.revision, label: "two edits", changes: [{ from: 0, to: 1, insert: "A" }, { from: 4, to: 5, insert: "C" }] });
  expect(new TextDecoder().decode(serializeDocument(document))).toBe("A\r\nб\nC\r\n");
  controller.execute({ documentId: document.id, revision: document.revision, label: "delete LF", changes: [{ from: 3, to: 4, insert: "" }] });
  expect(controller.undo()).toBe(true);
  expect(document.endings).toEqual(["crlf", "lf", "crlf"]);
  expect(controller.undo()).toBe(true);
  expect(serializeDocument(document)).toEqual(original);
  expect(controller.redo()).toBe(true);
  expect(document.text).toBe("A\nб\nC\n");
  view.destroy();
});
