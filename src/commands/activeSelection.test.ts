import { expect, it } from "vitest";
import { decodeDocument } from "../document/state";
import { createDocumentSession } from "../workspace/session";
import { resolveActiveSelection } from "./activeSelection";

it("uses the explicit builder range without consulting the hidden editor", () => {
  const session = createDocumentSession(decodeDocument(new TextEncoder().encode("text")));
  session.ui.activeSurface = "builder";
  session.ui.visualSelection = { from: 1, to: 3 };
  const controller = { getSelection: () => { throw new Error("hidden editor consulted"); } };
  expect(resolveActiveSelection(session, controller)).toMatchObject({ surface: "builder", from: 1, to: 3 });
});

it("reads the current CodeMirror selection for the code surface", () => {
  const session = createDocumentSession(decodeDocument(new TextEncoder().encode("text")));
  session.ui.activeSurface = "code";
  expect(resolveActiveSelection(session, { getSelection: () => ({ from: 2, to: 2 }) })).toMatchObject({ surface: "code", from: 2, to: 2 });
});
