import { expect, it, vi } from "vitest";
import { buildContextCommands, type ContextTarget } from "./commands";
const ids = (target: ContextTarget) => buildContextCommands(target, Object.fromEntries(["undo","redo","cut","copy","paste","delete","selectAll","bold","italic","underline","strike","spoiler","fix","copyText","copyInner","copyWrapped","copyBlock","source","unwrap","openLink","copyLink","copyMedia"].map((id) => [id, vi.fn()]))).map((item) => item.id);
it("builds exact surface-specific menus without foreign commands", () => {
  expect(ids({ surface: "field", editable: true, hasSelection: true })).toEqual(["undo","redo","cut","copy","delete","paste","selectAll"]);
  expect(ids({ surface: "code", editable: true, hasSelection: false, hasDiagnostic: true })).toEqual(["undo","redo","paste","selectAll","bold","italic","underline","strike","spoiler","fix"]);
  expect(ids({ surface: "builder", editable: true, hasSelection: true, hasBlock: true })).toEqual(["undo","redo","cut","copy","delete","bold","italic","underline","strike","spoiler","paste","selectAll","unwrap","source"]);
  expect(ids({ surface: "preview", editable: false, hasSelection: true, hasBlock: true })).toEqual(["copyText","copyInner","copyWrapped","copyBlock","source"]);
  expect(ids({ surface: "link", editable: false, hasSelection: false })).toEqual(["openLink","copyLink","source"]);
  expect(ids({ surface: "media", editable: false, hasSelection: false })).toEqual(["copyMedia","copyBlock","source"]);
});
