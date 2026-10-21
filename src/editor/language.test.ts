import { describe, expect, it } from "vitest";
import { spoilerFoldRanges, tagSpans } from "./language";

describe("BBCode language support", () => {
  it("classifies tag names, parameters and brackets", () => {
    expect(tagSpans('[url="https://4pda.to"]текст[/url]')).toEqual([
      { from: 0, to: 1, kind: "bracket" },
      { from: 1, to: 4, kind: "name" },
      { from: 4, to: 22, kind: "parameter" },
      { from: 22, to: 23, kind: "bracket" },
      { from: 28, to: 30, kind: "bracket" },
      { from: 30, to: 33, kind: "name" },
      { from: 33, to: 34, kind: "bracket" },
    ]);
  });

  it("returns the content ranges of nested spoilers", () => {
    const source = "[spoiler=Внешний]a[spoiler]b[/spoiler]c[/spoiler]";
    expect(spoilerFoldRanges(source)).toEqual([
      { from: 17, to: 39 },
      { from: 27, to: 28 },
    ]);
  });
});
