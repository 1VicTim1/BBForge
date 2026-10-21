import { describe, expect, it } from "vitest";
import { applyChanges, decodeDocument, serializeDocument } from "./state";

const bytes = (value: number[]) => new Uint8Array(value);

describe("document serialization", () => {
  it("roundtrips BOM and mixed line endings byte for byte", () => {
    const original = bytes([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a\r\nб\nв\r\n")]);
    const document = decodeDocument(original);

    expect(document.text).toBe("a\nб\nв\n");
    expect(document.endings).toEqual(["crlf", "lf", "crlf"]);
    expect(serializeDocument(document)).toEqual(original);
  });

  it("uses the dominant ending for inserted lines without changing neighbours", () => {
    const original = new TextEncoder().encode("a\r\nb\nc\r\n");
    const document = decodeDocument(original);
    const changed = applyChanges(document, [{ from: 3, to: 3, insert: "x\ny\n" }]);

    expect(new TextDecoder().decode(serializeDocument(changed))).toBe("a\r\nbx\r\ny\r\n\nc\r\n");
  });

  it("rejects invalid UTF-8", () => {
    expect(() => decodeDocument(bytes([0xc3, 0x28]))).toThrow("Файл не является корректным UTF-8");
  });

  it("keeps a newer edit dirty when an older snapshot is marked saved", () => {
    const initial = decodeDocument(new TextEncoder().encode("one"));
    const first = applyChanges(initial, [{ from: 3, to: 3, insert: " two" }]);
    const second = applyChanges(first, [{ from: 7, to: 7, insert: " three" }]);

    expect(second.revision).toBe(2);
    expect(second.text).toBe("one two three");
    expect(second.savedRevision).toBe(0);
  });
});
