// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LazyBlockGroup, SpoilerBlock } from "./Block";
afterEach(cleanup);
it("does not render offscreen root groups or collapsed hundred-level descendants", () => {
  let rendered = 0;
  const view = render(<LazyBlockGroup eager={false} count={100}>{() => { rendered++; return <p>{"текст".repeat(300000)}</p>; }}</LazyBlockGroup>);
  expect(rendered).toBe(0);
  expect(view.container.textContent!.length).toBeLessThan(100);
  view.rerender(<SpoilerBlock title="Closed" depth={3} onSelect={() => undefined}>{() => { rendered++; return <p>children</p>; }}</SpoilerBlock>);
  expect(rendered).toBe(0);
});
