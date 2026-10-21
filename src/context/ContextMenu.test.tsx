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
