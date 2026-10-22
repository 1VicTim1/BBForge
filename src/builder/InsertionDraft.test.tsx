// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InsertionDraft } from "./InsertionDraft";

afterEach(cleanup);

it("keeps typing local until Enter commits the complete draft", () => {
  const commit = vi.fn();
  const view = render(<InsertionDraft onCommit={commit} onCancel={vi.fn()} />);
  const input = view.getByRole("textbox");
  input.textContent = "новый текст";
  fireEvent.input(input);
  expect(commit).not.toHaveBeenCalled();

  fireEvent.keyDown(input, { key: "Enter" });
  expect(commit).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledWith("новый текст");
});

it("commits on blur and cancels on Escape", () => {
  const commit = vi.fn(), cancel = vi.fn();
  const view = render(<InsertionDraft key="blur" onCommit={commit} onCancel={cancel} />);
  const input = view.getByRole("textbox");
  input.textContent = "сохранить";
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledWith("сохранить");

  view.rerender(<InsertionDraft key="escape" onCommit={commit} onCancel={cancel} />);
  fireEvent.keyDown(view.getByRole("textbox"), { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
});
