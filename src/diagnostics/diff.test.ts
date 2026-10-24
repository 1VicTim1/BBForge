import { expect, it } from "vitest";
import { lineDiff } from "./diff";
import { decodeDocument } from "../document/state";

it("shows removed and added lines of a change", () => {
  const document = decodeDocument(new TextEncoder().encode("a\n[b]текст\nz"));
  expect(lineDiff(document, [{ from: 10, to: 10, insert: "[/b]" }])).toEqual([{ kind: "removed", text: "[b]текст" }, { kind: "added", text: "[b]текст[/b]" }]);
  expect(lineDiff(document, [{ from: 2, to: 10, insert: "" }])).toEqual([{ kind: "removed", text: "[b]текст" }, { kind: "added", text: "" }]);
});
