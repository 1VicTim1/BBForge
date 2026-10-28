import { describe, expect, it } from "vitest";
import { findMatches } from "./SidebarPanels";

const text = "[b]Версия: 0.3.0[/b]\n[url=https://x/0.3.0]Скачать 0.3.0[/url]";
// Text pieces between tags, as the analysis gives them.
const segments = [...text.matchAll(/(?<=\])[^[]+|^[^[]+/g)].map((match) => ({ from: match.index, to: match.index + match[0].length }));
const options = { regex: false, caseSensitive: false, scope: "text" as const, replacement: "0.4.0" };

describe("find and replace", () => {
  it("leaves tags alone in the text scope", () => {
    const { matches } = findMatches(text, "0.3.0", options, segments);
    expect(matches.map((item) => text.slice(item.from, item.to))).toEqual(["0.3.0", "0.3.0"]);
    expect(matches.every((item) => !text.slice(0, item.from).endsWith("x/"))).toBe(true);
  });
  it("finds everywhere or only inside tags", () => {
    expect(findMatches(text, "0.3.0", { ...options, scope: "all" }, segments).matches).toHaveLength(3);
    expect(findMatches(text, "0.3.0", { ...options, scope: "tags" }, segments).matches).toHaveLength(1);
  });
  it("supports regular expressions with groups and reports bad ones", () => {
    const { matches } = findMatches(text, "(\\d+)\\.3\\.(\\d+)", { ...options, regex: true, replacement: "$1.4.$2" }, segments);
    expect(matches.map((item) => item.replacement)).toEqual(["0.4.0", "0.4.0"]);
    expect(findMatches(text, "(", { ...options, regex: true }, segments).error).toContain("Ошибка в выражении");
  });
  it("respects case when asked", () => {
    expect(findMatches(text, "скачать", options, segments).matches).toHaveLength(1);
    expect(findMatches(text, "скачать", { ...options, caseSensitive: true }, segments).matches).toHaveLength(0);
  });
});
