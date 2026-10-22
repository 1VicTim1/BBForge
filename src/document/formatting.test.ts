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
it("inserts paired tags around an empty cursor and toggles an exact formatted range", () => {
  const plain = decodeDocument(new TextEncoder().encode("ab")), plainSnapshot = snapshotFixture(plain);
  const inserted = applyFormat(plain, plainSnapshot, { ...identity(plain), from: 1, to: 1 }, "b");
  expect(applyChanges(plain, inserted.changes).text).toBe("a[b][/b]b");
  expect(inserted.selection).toEqual({ from: 4, to: 4 });

  const bold = decodeDocument(new TextEncoder().encode("[b]ab[/b]")), boldSnapshot = snapshotFixture(bold);
  expect(applyChanges(bold, applyFormat(bold, boldSnapshot, { ...identity(bold), from: 3, to: 5 }, "b").changes).text).toBe("ab");
  expect(formatState(boldSnapshot, { ...identity(bold), from: 0, to: 0 }, "b")).toBe("on");
  expect(applyChanges(bold, applyFormat(bold, boldSnapshot, { ...identity(bold), from: 0, to: 0 }, "b").changes).text).toBe("ab");
  expect(applyChanges(bold, applyFormat(bold, boldSnapshot, { ...identity(bold), from: 0, to: bold.text.length }, "b").changes).text).toBe("ab");
});
