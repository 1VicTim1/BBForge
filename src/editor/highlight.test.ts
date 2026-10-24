import { describe, expect, it } from "vitest";
import { highlightSpans } from "./highlight";

const kinds = (source: string) => highlightSpans(source).spans.map((span) => [source.slice(span.from, span.to), span.kind]);

describe("BBCode highlighting roles", () => {
  it("colours inline, block, media and list-item tags by role", () => {
    expect(kinds("[b]x[/b][spoiler]y[/spoiler][img]https://a.b/c.png[/img][list][*]z[/list]")).toEqual([
      ["[", "bracket"], ["b", "inline"], ["]", "bracket"], ["[/", "bracket"], ["b", "inline"], ["]", "bracket"],
      ["[", "bracket"], ["spoiler", "block"], ["]", "bracket"], ["[/", "bracket"], ["spoiler", "block"], ["]", "bracket"],
      ["[", "bracket"], ["img", "media"], ["]", "bracket"], ["https://a.b/c.png", "url"], ["[/", "bracket"], ["img", "media"], ["]", "bracket"],
      ["[", "bracket"], ["list", "block"], ["]", "bracket"], ["[", "bracket"], ["*", "item"], ["]", "bracket"], ["[/", "bracket"], ["list", "block"], ["]", "bracket"],
    ]);
  });

  it("separates values from URLs and adds colour swatches", () => {
    const source = '[color=red]a[/color][url="https://4pda.to"]b[/url][size=4]c[/size]';
    expect(kinds(source).filter(([, kind]) => kind === "value" || kind === "url")).toEqual([["red", "value"], ['"https://4pda.to"', "url"], ["4", "value"]]);
    expect(highlightSpans(source).swatches).toEqual([{ at: 7, color: "red" }]);
  });

  it("marks unknown tags as a whole and keeps tags nested in a parameter", () => {
    expect(kinds("[ccasc][/ccasc]")).toEqual([["[ccasc]", "unknown"], ["[/ccasc]", "unknown"]]);
    expect(kinds("[spoiler=[b]T[/b]]x[/spoiler]").slice(0, 3)).toEqual([["[", "bracket"], ["spoiler", "block"], ["=", "bracket"]]);
    expect(kinds("[spoiler=[b]T[/b]]x[/spoiler]")).toContainEqual(["]", "bracket"]);
  });
});
