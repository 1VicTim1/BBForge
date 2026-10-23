import { expect, it } from "vitest";
import { applyChanges, decodeDocument } from "./state";
import { snapshotFixture } from "../test/structureFixture";
import { lowercaseTagNames, mergeAdjacentTags, removeEmptyTags, removeEscapedTags, removeRedundantNesting, trimTrailingWhitespace } from "./refactor";
import type { DocumentState } from "./state";
import type { AnalysisSnapshot } from "../analysis/types";
import type { EditCommand } from "./commands";

const run = (source: string, refactor: (document: DocumentState, snapshot: AnalysisSnapshot) => EditCommand | null) => {
  const document = decodeDocument(new TextEncoder().encode(source)), result = refactor(document, snapshotFixture(document));
  return result ? applyChanges(document, result.changes).text : null;
};

it("removes empty formatting but keeps its whitespace and real blocks", () => {
  expect(run("a[b][/b]b[color=red] [/color]c[i][u][/u][/i][spoiler=S][/spoiler]", removeEmptyTags)).toBe("ab c[spoiler=S][/spoiler]");
  expect(run("[b]x[/b]", removeEmptyTags)).toBeNull();
});

it("merges adjacent identical tags only", () => {
  expect(run("[b]a[/b][b]b[/b][b]c[/b] [b]d[/b][color=red]e[/color][color=blue]f[/color]", mergeAdjacentTags)).toBe("[b]abc[/b] [b]d[/b][color=red]e[/color][color=blue]f[/color]");
});

it("drops nested repeats of the same flag", () => {
  expect(run("[b]x [i][b]y[/b][/i][/b] [b]z[/b]", removeRedundantNesting)).toBe("[b]x [i]y[/i][/b] [b]z[/b]");
});

it("lower-cases tag names without touching parameters", () => {
  expect(run("[B]x[/B][SPOILER=Title CASE]y[/SPOILER]", lowercaseTagNames)).toBe("[b]x[/b][spoiler=Title CASE]y[/spoiler]");
});

it("trims trailing whitespace outside code blocks", () => {
  expect(run("a  \nb\t\n[code]keep  \n[/code]end ", trimTrailingWhitespace)).toBe("a\nb\n[code]keep  \n[/code]end");
});

it("removes tags escaped by the forum", () => {
  expect(run("a&#91;LIST&#93;b&#91;/LIST&#93;c &#91;url=\"x\"&#93;", removeEscapedTags)).toBe("abc ");
});
