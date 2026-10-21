import { expect, it } from "vitest";
import { applyFormat, formatState } from "./formatting";
import { applyChanges, decodeDocument } from "./state";
import { snapshotFixture } from "../test/structureFixture";
import { identity } from "./commands";
it("wraps text and updates an existing color without an extra wrapper", () => {
  const document = decodeDocument(new TextEncoder().encode("[color=red]😀text[/color]"));
  const snapshot = snapshotFixture(document), range = { ...identity(document), from: 11, to: 17 };
  expect(formatState(snapshot, range, "color")).toBe("on");
  expect(applyChanges(document, applyFormat(document, snapshot, range, "color", "#ffffff").changes).text).toBe("[color=#ffffff]😀text[/color]");
  expect(applyChanges(document, applyFormat(document, snapshot, range, "b").changes).text).toBe("[color=red][b]😀text[/b][/color]");
});
it("rejects a selection cutting tags and unsafe URL formatting", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]a[/b]x")), snapshot = snapshotFixture(document);
  expect(() => applyFormat(document, snapshot, { ...identity(document), from: 1, to: 9 }, "i")).toThrow();
  expect(() => applyFormat(document, snapshot, { ...identity(document), from: 3, to: 4 }, "url", "javascript:alert(1)")).toThrow();
  expect(formatState(snapshot, { ...identity(document), from: 3, to: 9 }, "b")).toBe("mixed");
});
