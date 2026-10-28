import { expect, it, vi } from "vitest";
import { buildContextCommands, runnable, type ContextTarget } from "./commands";
const all = ["undo","redo","cut","copy","paste","delete","selectAll","bold","italic","underline","strike","spoiler","fix","copyText","copyInner","copyWrapped","copyBlock","source","unwrap","openLink","copyLink","copyMedia"];
const build = (target: ContextTarget, extra = []) => buildContextCommands(target, Object.fromEntries(all.map((id) => [id, vi.fn()])), extra);
const shape = (target: ContextTarget) => build(target).map((item) => item.kind === "separator" ? "|" : item.children ? `${item.id}(${item.children.map((child) => child.id).join(",")})` : item.id);
it("builds grouped surface-specific menus without foreign commands", () => {
  expect(shape({ surface: "field", editable: true, hasSelection: true })).toEqual(["undo","redo","|","cut","copy","paste","delete","|","selectAll"]);
  expect(shape({ surface: "code", editable: true, hasSelection: false, hasDiagnostic: true })).toEqual(["paste","|","format(bold,italic,underline,strike,spoiler)","fix","|","selectAll"]);
  expect(shape({ surface: "builder", editable: true, hasSelection: true, hasBlock: true })).toEqual(["cut","copy","paste","delete","|","format(bold,italic,underline,strike,spoiler)","unwrap","|","selectAll","source"]);
  expect(shape({ surface: "preview", editable: false, hasSelection: true, hasBlock: true })).toEqual(["copyText","copyInner","copyWrapped","copyBlock","|","source"]);
  expect(shape({ surface: "link", editable: false, hasSelection: false })).toEqual(["openLink","copyLink","|","source"]);
  expect(shape({ surface: "media", editable: false, hasSelection: false })).toEqual(["copyMedia","copyBlock","|","source"]);
});
it("puts spelling and fixes first, each group apart", () => {
  const word = [{ id: "spell-0", label: "«слово»", run: vi.fn() }], fix = [{ id: "fix-a", label: "Исправить", run: vi.fn() }];
  const menu = buildContextCommands({ surface: "code", editable: true, hasSelection: false }, { paste: vi.fn() }, [word, [], fix]);
  expect(menu.map((item) => item.kind === "separator" ? "|" : item.id)).toEqual(["spell-0", "|", "fix-a", "|", "paste"]);
  expect(runnable(menu).map((item) => item.id)).toEqual(["spell-0", "fix-a", "paste"]);
});
