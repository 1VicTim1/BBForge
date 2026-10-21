// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
afterEach(() => { cleanup(); localStorage.clear(); });

describe("BBForge shell", () => {
  it("shows the editor, outline, preview and diagnostics regions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "BBForge" })).toBeTruthy();
    expect(screen.getByLabelText("Редактор BBCode")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Структура" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Конструктор" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Проблемы/ })).toBeTruthy();
  });

  it("can restore the diagnostics panel after hiding it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Скрыть проблемы" }));
    expect(screen.queryByRole("heading", { name: /Проблемы/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Проблемы" }));
    expect(screen.getByRole("heading", { name: /Проблемы/ })).toBeTruthy();
  });

  it("starts a new document with an empty undo history", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Новый/ }));
    await waitFor(() => expect(document.querySelector(".cm-placeholder")).not.toBeNull());
    const content = document.querySelector(".cm-content") as HTMLElement;

    fireEvent.keyDown(content, { key: "z", ctrlKey: true });
    expect(document.querySelector(".cm-placeholder")).not.toBeNull();
  });
});
