// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChangePreview } from "./ChangePreview";
import { decodeDocument } from "../document/state";
import { identity } from "../document/commands";
afterEach(cleanup);
it("shows a diff without modifying text and cancel never applies it", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]x")), apply = vi.fn(), close = vi.fn();
  render(<ChangePreview document={document} suggestion={{ id: "x", title: "Close", command: { ...identity(document), label: "close", changes: [{ from: 4, to: 4, insert: "[/b]" }] } }} onApply={apply} onClose={close} />);
  expect(screen.getByText("[b]x[/b]")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(apply).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce(); expect(document.text).toBe("[b]x");
});
it("keeps dollar sequences literal in user supplied parameters", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler]x[/spoiler]"));
  render(<ChangePreview document={document} suggestion={{ id: "p", title: "Parameter", needsParameter: "title", command: { ...identity(document), label: "parameter", changes: [{ from: 0, to: 9, insert: "[spoiler=$VALUE]" }] } }} onApply={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Значение параметра"), { target: { value: "Цена $&" } });
  expect(screen.getByText("[spoiler=Цена $&]x[/spoiler]")).toBeTruthy();
});
