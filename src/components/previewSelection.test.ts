// @vitest-environment jsdom
import { expect, it } from "vitest";
import { decodeDocument } from "../document/state";
import { identity } from "../document/commands";
import { snapshotFixture } from "../test/structureFixture";
import { extractPreviewBbcode } from "./previewSelection";

const extract = (source: string, from: number, to: number) => {
  const document = decodeDocument(new TextEncoder().encode(source)), snapshot = snapshotFixture(document), range = { ...identity(document), from, to };
  return [extractPreviewBbcode(document, snapshot, range, false), extractPreviewBbcode(document, snapshot, range, true)];
};
it("copies a partial bold selection with and without inherited formatting", () => expect(extract("[b]abcdef[/b]", 5, 7)).toEqual(["cd", "[b]cd[/b]"]));
it("retains fully selected internal tags while balancing partial ancestors", () => expect(extract("[i]я[b]😀x[/b]z[/i]", 3, 15)).toEqual(["я[b]😀x[/b]z", "[i]я[b]😀x[/b]z[/i]"]));
it("copies a full spoiler byte-for-byte", () => {
  const source = "[spoiler=S][b]x[/b][/spoiler]";
  expect(extract(source, 0, source.length)).toEqual([source, source]);
});
it("copies a colored link block without changing tag order", () => {
  const source = '[url="https://4pda.to"][color=Blue]QMS[/color][/url]';
  const from = source.indexOf("QMS"), to = from + 3;
  expect(extract(source, from, to)).toEqual(["QMS", source]);
});
