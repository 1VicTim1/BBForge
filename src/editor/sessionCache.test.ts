import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { EditorSessionCache } from "./sessionCache";

it("keeps editor states isolated by document and discards closed sessions", () => {
  const cache = new EditorSessionCache();
  const first = EditorState.create({ doc: "one", selection: { anchor: 2 } });
  const second = EditorState.create({ doc: "two", selection: { anchor: 1 } });
  cache.save("first", first);
  cache.save("second", second);
  expect(cache.restore("first")).toBe(first);
  expect(cache.restore("second")?.selection.main.head).toBe(1);
  cache.delete("first");
  expect(cache.restore("first")).toBeUndefined();
});
