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

it("offers removing or restoring BBCode escaped by the forum", () => {
  const source = "[color=Blue]&#91;url=\"https://4pda.to\"&#93;QMS[/color]";
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document);
  const escaped = "&#91;url=\"https://4pda.to\"&#93;", from = source.indexOf(escaped);
  const diagnostic = { code: "escapedBbcodeTag", severity: "info" as const, message: "", span: { start: from, end: from + escaped.length }, line: 1, column: from + 1 };
  const [remove, restore] = suggestFixes(document, snapshot, diagnostic);
  expect(applyChanges(document, remove.command.changes).text).toBe("[color=Blue]QMS[/color]");
  expect(applyChanges(document, restore.command.changes).text).toBe("[color=Blue][url=\"https://4pda.to\"]QMS[/color]");
});

const tokenize = (source: string) => [...source.matchAll(/\[(\/)?([a-z*]+)(?:=[^\]]+)?\]/gi)].map((match) => ({
  kind: match[1] ? "closingTag" as const : "openingTag" as const, name: match[2].toLowerCase(), parameter: null,
  span: { start: match.index, end: match.index + match[0].length },
}));

it("repairs a crossed closing tag by closing and reopening the inner tags", () => {
  const source = "[i]a[b]b[/i]c[/b]";
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document);
  snapshot.analysis.tokens = tokenize(source);
  const closing = snapshot.analysis.tokens[2];
  const fixes = suggestFixes(document, snapshot, { code: "crossedClosingTag", severity: "warning", message: "", span: closing.span, line: 1, column: 9 });
  expect(fixes.map((fix) => applyChanges(document, fix.command.changes).text)).toEqual(["[i]a[b]b[/b][/i][b]c[/b]", "[i]a[b]bc[/b]"]);
});

it("only closes inner tags that never close later", () => {
  const source = "[i]a[color=red]b[/i]c";
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document);
  snapshot.analysis.tokens = tokenize(source);
  const closing = snapshot.analysis.tokens[2];
  const [repair] = suggestFixes(document, snapshot, { code: "crossedClosingTag", severity: "warning", message: "", span: closing.span, line: 1, column: 17 });
  expect(applyChanges(document, repair.command.changes).text).toBe("[i]a[color=red]b[/color][/i]c");
});

it("preserves a colored link by reordering adjacent opening tags", () => {
  const source = '[color=Blue][url="https://4pda.to"]QMS[/color][/url]';
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document);
  snapshot.analysis.tokens = [...source.matchAll(/\[(\/)?([a-z]+)(?:=[^\]]+)?\]/gi)].map((match) => ({
    kind: match[1] ? "closingTag" as const : "openingTag" as const,
    name: match[2].toLowerCase(), parameter: null,
    span: { start: match.index, end: match.index + match[0].length },
  }));
  const closing = snapshot.analysis.tokens[2];
  const diagnostic = { code: "crossedClosingTag", severity: "warning" as const, message: "", span: closing.span, line: 1, column: closing.span.start + 1 };
  const fixes = suggestFixes(document, snapshot, diagnostic);

  expect(fixes).toHaveLength(1);
  expect(applyChanges(document, fixes[0].command.changes).text).toBe('[url="https://4pda.to"][color=Blue]QMS[/color][/url]');
});
