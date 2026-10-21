// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

describe("BBForge shell", () => {
  it("shows the editor, outline, preview and diagnostics regions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "BBForge" })).toBeTruthy();
    expect(screen.getByLabelText("Редактор BBCode")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Структура" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Предпросмотр" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Проблемы" })).toBeTruthy();
  });
});
