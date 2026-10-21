import { describe, expect, it } from "vitest";
import { byteToUtf16, createPositionIndex, utf16ToByte } from "./positions";

describe("position conversion", () => {
  it("roundtrips every character boundary in Cyrillic and emoji", () => {
    const source = "я😀[b]текст";
    const byteOffsets = [0, 2, 6, 7, 8, 9, 11, 13, 15, 17];

    for (const byteOffset of byteOffsets) {
      expect(utf16ToByte(source, byteToUtf16(source, byteOffset))).toBe(byteOffset);
    }
  });

  it("maps the tag after emoji to CodeMirror position two", () => {
    const source = "😀[b]";

    expect(byteToUtf16(source, 4)).toBe(2);
    expect(utf16ToByte(source, 2)).toBe(4);
  });

  it("clamps offsets that split encoded characters", () => {
    expect(byteToUtf16("😀", 2)).toBe(0);
    expect(utf16ToByte("😀", 1)).toBe(0);
  });
});

describe("position index", () => {
  it("converts many offsets from one precomputed snapshot", () => {
    const source = "a😀бc";
    const index = createPositionIndex(source);
    expect([0, 1, 5, 7, 8].map((offset) => index.byteToUtf16(offset))).toEqual([0, 1, 3, 4, 5]);
  });
});
