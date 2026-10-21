// @vitest-environment jsdom
import { fireEvent, render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TextLeaf } from "./TextLeaf";
afterEach(cleanup);
it("commits IME text once after composition and survives source rerenders", () => {
  const edit = vi.fn();
  const props = { text: "я", from: 3, to: 4, onEdit: edit, onSelect: vi.fn(), onPasteCode: vi.fn(), onComposition: vi.fn() };
  const view = render(<TextLeaf {...props} />);
  const input = view.getByRole("textbox");
  fireEvent.compositionStart(input);
  input.textContent = "日本";
  fireEvent.input(input, { isComposing: true });
  view.rerender(<TextLeaf {...props} />);
  expect(edit).not.toHaveBeenCalled();
  expect(input.textContent).toBe("日本");
  fireEvent.compositionEnd(input);
  fireEvent.input(input);
  expect(edit).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledWith({ from: 3, to: 4 }, "日本", "я");
});
it("restores the original leaf when a transaction is rejected", () => {
  const edit = vi.fn(() => { throw new Error("stale"); });
  const view = render(<TextLeaf text="original" from={0} to={8} onEdit={edit} onSelect={vi.fn()} onPasteCode={vi.fn()} onComposition={vi.fn()} />);
  const input = view.getByRole("textbox"); input.textContent = "lost";
  fireEvent.input(input);
  expect(input.textContent).toBe("original");
});
