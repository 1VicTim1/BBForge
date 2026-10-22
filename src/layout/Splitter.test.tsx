// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Splitter } from "./Splitter";

it("restores its preferred size on double click", () => {
  const onChange = vi.fn();
  const view = render(<Splitter value={320} min={180} max={480} resetValue={232} label="Ширина структуры" onChange={onChange} />);
  fireEvent.doubleClick(view.getByRole("separator", { name: "Ширина структуры" }));
  expect(onChange).toHaveBeenCalledWith(232);
});
