import { describe, expect, it, vi } from "vitest";
import { paragraphsOf, TextChecker } from "./textCheck";

const block = (gap: string) => /\[\/?(spoiler|\*|list|quote|code)/i.test(gap);

describe("text check", () => {
  it("cuts paragraphs at line breaks and block tags, not at inline formatting", () => {
    const source = "Это [b]важный[/b] текст\nВторая строка[list][*]Пункт один[*]Пункт два[/list]";
    const segments = [...source.matchAll(/[^[\]]+(?=\[|$)/g)].map((match) => ({ from: match.index, to: match.index + match[0].length }));
    expect(paragraphsOf(source, segments, block).map((item) => item.text)).toEqual(["Это важный текст", "Вторая строка", "Пункт один", "Пункт два"]);
  });

  it("sends only new paragraphs and maps what it finds back onto the source", async () => {
    const source = "Я [b]пашол[/b] домой\nОн пришёл", segments = [{ from: 0, to: 2 }, { from: 5, to: 10 }, { from: 14, to: 30 }];
    const check = vi.fn(async (text: string) => {
      const at = text.indexOf("пашол");
      return at >= 0 ? [{ offset: at, length: 5, message: "Опечатка", replacements: ["пошёл"], kind: "spelling" }] : [];
    });
    const checker = new TextChecker("LT", check);
    const issues = await checker.issues(paragraphsOf(source, segments, block));
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toBe("Я пашол домой\n\nОн пришёл");
    expect(issues).toEqual([{ from: 5, to: 10, message: "Опечатка", replacements: ["пошёл"], kind: "spelling", checker: "LT" }]);
    expect(source.slice(5, 10)).toBe("пашол");
    // The same text again: answered from the cache.
    await checker.issues(paragraphsOf(source, segments, block));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("drops matches that cross paragraphs or come back malformed", async () => {
    const checker = new TextChecker("LT", async () => [{ offset: 3, length: 6 }, { offset: -1, length: 2 }, { offset: 0, length: 0 }, { offset: 6, length: 3, kind: "weird" }]);
    const source = "abcd\nefgh";
    const issues = await checker.issues(paragraphsOf(source, [{ from: 0, to: 9 }], block));
    expect(issues).toEqual([{ from: 5, to: 8, message: "", replacements: [], kind: "grammar", checker: "LT" }]);
  });
});
