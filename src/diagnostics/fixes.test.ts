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

it("decodes an escaped URL tag and closes it before the surrounding format", () => {
  const source = "[color=Blue]&#91;url=\"https://4pda.to\"&#93;QMS[/color]";
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document);
  const escaped = "&#91;url=\"https://4pda.to\"&#93;", from = source.indexOf(escaped);
  const diagnostic = { code: "escapedBbcodeTag", severity: "warning" as const, message: "", span: { start: from, end: from + escaped.length }, line: 1, column: from + 1 };
  const fixes = suggestFixes(document, snapshot, diagnostic);

  expect(fixes).toHaveLength(1);
  expect(applyChanges(document, fixes[0].command.changes).text).toBe("[color=Blue][url=\"https://4pda.to\"]QMS[/url][/color]");
});
