// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { decodeDocument, updateDocumentText } from "../document/state";
import { createDocumentSession } from "./session";
import { TabStrip } from "./TabStrip";

it("renders dirty tabs and exposes activate and close actions", () => {
  const original = decodeDocument(new TextEncoder().encode("x"), "/tmp/topic.bbcode");
  const tab = createDocumentSession(updateDocumentText(original, "changed", []));
  const activate = vi.fn(), close = vi.fn();
  const view = render(<TabStrip tabs={[tab]} activeId={tab.document.id} onActivate={activate} onClose={close} />);
  expect(view.getByRole("tab", { name: /topic\.bbcode/ }).getAttribute("aria-selected")).toBe("true");
  expect(view.getByText("●")).toBeTruthy();
  fireEvent.click(view.getByRole("tab", { name: /topic\.bbcode/ }));
  fireEvent.click(view.getByRole("button", { name: "Закрыть topic.bbcode" }));
  expect(activate).toHaveBeenCalledWith(tab.document.id);
  expect(close).toHaveBeenCalledWith(tab.document.id);
});
