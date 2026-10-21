// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

describe("Editor", () => {
  it("updates the CodeMirror document when another file is opened", () => {
    const view = render(<Editor key="first" value="первый" endings={[]} onChange={vi.fn()} />);
    view.rerender(<Editor key="second" value="второй" endings={[]} onChange={vi.fn()} />);

    expect(view.container.querySelector(".cm-content")?.textContent).toBe("второй");
  });
});
