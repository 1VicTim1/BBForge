import { expect, it } from "vitest";
import { defaultLayout, loadLayout, saveLayout } from "./settings";
it("rejects malformed preferences and clamps saved dimensions", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } } as unknown as Storage;
  storage.setItem("bbforge.layout", "broken");
  expect(loadLayout(storage)).toEqual(defaultLayout);
  saveLayout(storage, { ...defaultLayout, outlineWidth: 999, splitRatio: -1, problemsHeight: 1 });
  expect(loadLayout(storage)).toMatchObject({ outlineWidth: 480, splitRatio: .25, problemsHeight: 100 });
});
