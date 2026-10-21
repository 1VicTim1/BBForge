import { expect, it } from "vitest";
import { textEditCommand, literalPaste, normalizeInput } from "./input";
import { applyChanges, decodeDocument } from "../document/state";
it("makes minimal Unicode text edits and normalizes pasted endings", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]я😀[/b]"));
  const result = applyChanges(document, textEditCommand(document, { from: 3, to: 6 }, "ты😀").changes);
  expect(result.text).toBe("[b]ты😀[/b]");
  expect(normalizeInput("a\r\nb\rc")).toBe("a\nb\nc");
  expect(literalPaste("[b]x")).toBe("[code][b]x[/code]");
  expect(() => literalPaste("[/code]")).toThrow();
});
