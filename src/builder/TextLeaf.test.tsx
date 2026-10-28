// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TextLeaf } from "./TextLeaf";
import { domToSource, placeSelection, renderedText, selectionToSource } from "./editing";
afterEach(cleanup);

it("draws its text with a sentinel for a trailing line break and keeps the text node while unchanged", () => {
  const view = render(<TextLeaf text={"line\n"} from={3} to={8} />);
  const leaf = view.getByRole("textbox");
  expect(leaf.firstChild?.textContent).toBe("line\n");
  expect(leaf.querySelector("[data-editor-sentinel]")).not.toBeNull();
  const node = leaf.firstChild;
  view.rerender(<TextLeaf text={"line\n"} from={3} to={8} />);
  expect(leaf.firstChild).toBe(node);
  view.rerender(<TextLeaf text="lines" from={3} to={8} />);
  expect(leaf.textContent).toBe("lines");
  expect(leaf.querySelector("[data-editor-sentinel]")).toBeNull();
  expect(renderedText.get(leaf)).toBe("lines");
});

it("rewrites text an input method left behind, but not while composing", () => {
  const view = render(<div data-composing="true"><TextLeaf text="я" from={0} to={1} /></div>);
  const leaf = view.getByRole("textbox");
  leaf.textContent = "日本";
  view.rerender(<div data-composing="true"><TextLeaf text="я" from={0} to={1} /></div>);
  expect(leaf.textContent).toBe("日本");
  view.rerender(<div><TextLeaf text="я" from={0} to={1} /></div>);
  expect(leaf.textContent).toBe("я");
});

it("maps the caret between text pieces and source offsets", () => {
  const view = render(<div contentEditable suppressContentEditableWarning><TextLeaf text="hello " from={0} to={6} /><b><TextLeaf text="world" from={9} to={14} /></b></div>);
  const root = view.container.firstElementChild!;
  expect(placeSelection(root, 11)).toBe(true);
  expect(selectionToSource(root)).toMatchObject({ from: 11, to: 11, leaf: { from: 9, to: 14 } });
  // A point between the pieces belongs to the next one.
  expect(domToSource(root, root, 1)).toBe(9);
  expect(domToSource(root, root, 2)).toBe(14);
});
