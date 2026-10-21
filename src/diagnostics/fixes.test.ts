import { expect, it } from "vitest";
import { combineFixes, suggestFixes } from "./fixes";
import { applyChanges, decodeDocument } from "../document/state";
import { snapshotFixture } from "../test/structureFixture";
it("offers only unambiguous closing repairs and keeps unknown tags intact", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]hello")), snapshot = snapshotFixture(document);
  const diagnostic = { code: "unclosedTag", severity: "error" as const, message: "", span: { start: 0, end: 3 }, line: 1, column: 1 };
  const fixes = suggestFixes(document, snapshot, diagnostic);
  expect(applyChanges(document, fixes[0].command.changes).text).toBe("[b]hello[/b]");
  expect(suggestFixes(document, snapshot, { ...diagnostic, code: "unknownTag" })).toEqual([]);
  expect(suggestFixes(document, snapshot, { ...diagnostic, code: "crossedClosingTag" })).toEqual([]);
  expect(() => combineFixes(document, [fixes[0], fixes[0]])).toThrow();
  expect(() => combineFixes({ ...document, revision: 1 }, fixes)).toThrow();
});
