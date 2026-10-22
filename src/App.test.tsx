// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { decodeDocument, updateDocumentText } from "./document/state";
import { serializeWorkspace } from "./workspace/persistence";
import { createWorkspace, workspaceReducer } from "./workspace/session";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
afterEach(() => { cleanup(); localStorage.clear(); });

describe("BBForge shell", () => {
  it("shows the editor, outline, preview and collapsed diagnostics regions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "BBForge" })).toBeTruthy();
    expect(screen.getByLabelText("Редактор BBCode")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Структура" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Конструктор" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Проблемы.*Ошибок не найдено/ })).toBeTruthy();
  });

  it("can open, hide and restore the diagnostics panel", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Проблемы.*Ошибок не найдено/ }));
    expect(screen.getByRole("heading", { name: /Проблемы/ })).toBeTruthy();
    const diagnostics = screen.getByRole("heading", { name: /Проблемы/ }).closest("section");
    fireEvent.click(within(diagnostics as HTMLElement).getByRole("button", { name: "Скрыть проблемы" }));
    expect(screen.queryByRole("heading", { name: /Проблемы/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Проблемы" }));
    expect(screen.getByRole("heading", { name: /Проблемы/ })).toBeTruthy();
  });

  it("starts a new document with an empty undo history", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Новый документ" }));
    await waitFor(() => expect(document.querySelector(".cm-placeholder")).not.toBeNull());
    const content = document.querySelector(".cm-content") as HTMLElement;

    fireEvent.keyDown(content, { key: "z", ctrlKey: true });
    expect(document.querySelector(".cm-placeholder")).not.toBeNull();
  });

  it("restores every tab and unsaved text with a fresh undo baseline", async () => {
    const first = decodeDocument(new TextEncoder().encode("saved"), "/tmp/first.bbcode");
    const changed = updateDocumentText(first, "unsaved", []);
    const second = decodeDocument(new TextEncoder().encode("second"), "/tmp/second.bbcode");
    let workspace = createWorkspace(changed);
    workspace = workspaceReducer(workspace, { type: "open", session: { document: second } });
    workspace = workspaceReducer(workspace, { type: "activate", documentId: changed.id });
    localStorage.setItem("bbforge.workspace.v1", serializeWorkspace(workspace));

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    const content = document.querySelector(".cm-content") as HTMLElement;
    await waitFor(() => expect(content.textContent).toBe("unsaved"));
    fireEvent.keyDown(content, { key: "z", ctrlKey: true });
    expect(content.textContent).toBe("unsaved");
  });
});
