// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";
afterEach(cleanup);
it("runs commands and supports keyboard navigation and Escape", () => {
  const run = vi.fn(), close = vi.fn();
  const view = render(<ContextMenu x={20} y={20} commands={[{ id: "one", label: "Первый", run }, { id: "two", label: "Второй", run: vi.fn() }]} onClose={close} />);
  const menu = view.getByRole("menu");
  expect(document.activeElement).toBe(view.getByRole("menuitem", { name: "Первый" }));
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(view.getByRole("menuitem", { name: "Второй" }));
  fireEvent.keyDown(menu, { key: "Escape" }); expect(close).toHaveBeenCalled();
  fireEvent.click(view.getByRole("menuitem", { name: "Первый" })); expect(run).toHaveBeenCalled();
});
it("opens a submenu with ArrowRight and goes back with ArrowLeft; headings and separators are not items", () => {
  const bold = vi.fn(), close = vi.fn();
  const view = render(<ContextMenu x={20} y={20} onClose={close} commands={[
    { id: "h", label: "Возможная опечатка", kind: "header", run: vi.fn() },
    { id: "paste", label: "Вставить", run: vi.fn() },
    { id: "s", label: "", kind: "separator", run: vi.fn() },
    { id: "format", label: "Формат", run: vi.fn(), children: [{ id: "bold", label: "Жирный", run: bold }] },
  ]} />);
  expect(view.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Вставить", "Формат›"]);
  const format = view.getByRole("menuitem", { name: "Формат" });
  format.focus();
  fireEvent.keyDown(format, { key: "ArrowRight" });
  const bolded = view.getByRole("menuitem", { name: "Жирный" });
  expect(document.activeElement).toBe(bolded);
  fireEvent.keyDown(bolded, { key: "ArrowLeft" });
  expect(view.queryByRole("menuitem", { name: "Жирный" })).toBeNull();
  expect(document.activeElement).toBe(format);
  fireEvent.click(format);
  fireEvent.click(view.getByRole("menuitem", { name: "Жирный" }));
  expect(bold).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});
