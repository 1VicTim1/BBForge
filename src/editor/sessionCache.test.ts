import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { EditorSessionCache } from "./sessionCache";

it("keeps editor states isolated by document and discards closed sessions", () => {
  const cache = new EditorSessionCache();
  const first = EditorState.create({ doc: "one", selection: { anchor: 2 } });
  const second = EditorState.create({ doc: "two", selection: { anchor: 1 } });
  cache.save("first", first);
  cache.save("second", second);
  cache.saveViewport("first", { top: 120, left: 4 });
  expect(cache.restore("first")).toBe(first);
  expect(cache.restore("second")?.selection.main.head).toBe(1);
  expect(cache.restoreViewport("first")).toEqual({ top: 120, left: 4 });
  cache.delete("first");
  expect(cache.restore("first")).toBeUndefined();
  expect(cache.restoreViewport("first")).toBeUndefined();
});
