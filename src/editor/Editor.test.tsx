// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

describe("Editor", () => {
  it("updates the CodeMirror document when another file is opened", () => {
    const view = render(<Editor value="первый" onChange={vi.fn()} />);
    view.rerender(<Editor value="второй" onChange={vi.fn()} />);

    expect(view.container.querySelector(".cm-content")?.textContent).toBe("второй");
  });
});
