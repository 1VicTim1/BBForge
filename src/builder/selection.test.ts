// @vitest-environment jsdom
import { expect, it } from "vitest";
import { restoreVisualSelection } from "./selection";

it("restores a visual caret from its source offset", () => {
  document.body.innerHTML = '<div id="root"><span contenteditable="true" data-source-from="10" data-source-to="15">hello</span></div>';
  const root = document.querySelector<HTMLElement>("#root")!;
  expect(restoreVisualSelection(root, { from: 13, to: 13 })).toBe(true);
  const range = window.getSelection()!.getRangeAt(0);
  expect(range.startContainer.textContent).toBe("hello");
  expect(range.startOffset).toBe(3);
});
