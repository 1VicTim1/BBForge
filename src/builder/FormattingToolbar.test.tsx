// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FormattingToolbar } from "./FormattingToolbar";
afterEach(cleanup);

it("focuses the link field, rejects invalid addresses and cancels with Escape", () => {
  const format = vi.fn();
  const view = render(<FormattingToolbar disabled={false} onFormat={format} onSpoiler={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} />);
  fireEvent.click(view.getByRole("button", { name: "Добавить ссылку" }));
  const input = view.getByLabelText("Адрес ссылки");
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
  fireEvent.submit(input.closest("form")!);
  expect(format).not.toHaveBeenCalled();
  expect(view.getByRole("alert").textContent).toContain("https");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(view.queryByLabelText("Адрес ссылки")).toBeNull();
});

it("exposes formatting state, disabled reason and every command", () => {
  const format = vi.fn();
  const view = render(<FormattingToolbar disabled={false} states={{ b: { state: "on" }, i: { state: "disabled", reason: "Небезопасное выделение" } }} onFormat={format} onSpoiler={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} />);
  expect(view.getByRole("button", { name: "Жирный" }).getAttribute("aria-pressed")).toBe("true");
  expect(view.getByRole("button", { name: "Курсив" }).getAttribute("title")).toBe("Небезопасное выделение");
  expect((view.getByRole("button", { name: "Курсив" }) as HTMLButtonElement).disabled).toBe(true);
  for (const [name, tag] of [["Жирный", "b"], ["Подчёркнутый", "u"], ["Зачёркнутый", "s"], ["Цитата", "quote"], ["Блок кода", "code"], ["Список", "list"]] as const) {
    fireEvent.click(view.getByRole("button", { name }));
    expect(format).toHaveBeenLastCalledWith(tag);
  }
});

it("retains and applies the chosen link and colors", () => {
  const format = vi.fn();
  const view = render(<FormattingToolbar disabled={false} onFormat={format} onSpoiler={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} />);
  fireEvent.change(view.getByLabelText("Цвет текста"), { target: { value: "#ff0000" } });
  fireEvent.click(view.getByRole("button", { name: "Применить цвет текста" }));
  expect(format).toHaveBeenLastCalledWith("color", "#ff0000");
  fireEvent.click(view.getByRole("button", { name: "Добавить ссылку" }));
  fireEvent.change(view.getByLabelText("Адрес ссылки"), { target: { value: "https://example.com" } });
  fireEvent.submit(view.getByLabelText("Адрес ссылки").closest("form")!);
  expect(format).toHaveBeenLastCalledWith("url", "https://example.com");
});
