import { expect, it } from "vitest";
import { decodeDocument, updateDocumentText } from "../document/state";
import { createWorkspace, workspaceReducer } from "./session";

const doc = (text: string, path: string | null = null) => decodeDocument(new TextEncoder().encode(text), path);

it("keeps independent tabs and activates an already open canonical path", () => {
  const first = doc("one", "/tmp/a.bbcode");
  let state = createWorkspace(first);
  const second = doc("two", "/tmp/b.bbcode");
  state = workspaceReducer(state, { type: "open", session: { document: second }, canonicalPath: (path) => path });
  expect(state.tabs.map((tab) => tab.document.text)).toEqual(["one", "two"]);
  expect(state.activeId).toBe(second.id);
  state = workspaceReducer(state, { type: "updateDocument", documentId: first.id, document: updateDocumentText(first, "changed", []) });
  expect(state.tabs.map((tab) => tab.document.text)).toEqual(["changed", "two"]);
  const duplicate = doc("disk", "/TMP/A.BBCODE");
  state = workspaceReducer(state, { type: "open", session: { document: duplicate }, canonicalPath: (path) => path.toLowerCase() });
  expect(state.tabs).toHaveLength(2);
  expect(state.activeId).toBe(first.id);
});

it("reorders and closes tabs while preserving an active document", () => {
  const first = doc("one"), second = doc("two"), third = doc("three");
  let state = createWorkspace(first);
  for (const document of [second, third]) state = workspaceReducer(state, { type: "open", session: { document } });
  state = workspaceReducer(state, { type: "reorder", documentId: third.id, to: 0 });
  expect(state.tabs.map((tab) => tab.document.id)).toEqual([third.id, first.id, second.id]);
  state = workspaceReducer(state, { type: "close", documentId: third.id });
  expect(state.activeId).toBe(first.id);
});
