import { describe, expect, it, vi } from "vitest";
import { SpellChecker, wordsIn } from "./spell";

describe("spell checking", () => {
  it("takes words from text, not from links, addresses or file names", () => {
    const text = "Скачать программу с https://4pda.to/forum и написать mail@x.ru, файл setup.exe — Wi-Fi-роутер";
    expect(wordsIn(text, [{ from: 0, to: text.length }]).map((item) => item.word)).toEqual(["Скачать", "программу", "с", "и", "написать", "файл", "Wi-Fi-роутер"]);
  });
  it("checks each word once and forgets ignored ones", async () => {
    const check = vi.fn(async (words: string[]) => words.map((word) => word !== "праграмма"));
    const checker = new SpellChecker({ check, suggest: async () => ["программа"], add: async () => undefined });
    const text = "праграмма и праграмма";
    expect((await checker.misspellings(text, [{ from: 0, to: text.length }])).map((item) => [item.from, item.to])).toEqual([[0, 9], [12, 21]]);
    await checker.misspellings(text, [{ from: 0, to: text.length }]);
    expect(check).toHaveBeenCalledOnce();
    checker.ignore("Праграмма");
    expect(await checker.misspellings(text, [{ from: 0, to: text.length }])).toEqual([]);
  });
});
