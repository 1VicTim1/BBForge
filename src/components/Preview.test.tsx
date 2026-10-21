// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Diagnostics } from "./Diagnostics";
import { Outline } from "./Outline";
import { Preview, safeExternalUrl } from "./Preview";
import type { Analysis } from "../analysis/types";

const source = "[spoiler=[b][color=red]Важно[/color][/b]]текстссылка[/spoiler]";
const byteAt = (position: number) => new TextEncoder().encode(source.slice(0, position)).length;
const textFrom = source.indexOf("текст");
const linkFrom = source.indexOf("ссылка");
const closeFrom = source.indexOf("[/spoiler]");
const analysis: Analysis = {
  tokens: [], diagnostics: [{ code: "unclosedTag", severity: "error", message: "Тег не закрыт", span: { start: 0, end: 3 }, line: 1, column: 1 }],
  nodes: [{ kind: "element", name: "spoiler", parameter: "[b][color=red]Важно[/color][/b]", span: { start: 0, end: new TextEncoder().encode(source).length }, openingSpan: null, closingSpan: null, contentSpan: { start: byteAt(textFrom), end: byteAt(closeFrom) }, wellFormed: true, children: [
    { kind: "text", name: null, parameter: null, span: { start: byteAt(textFrom), end: byteAt(linkFrom) }, openingSpan: null, closingSpan: null, contentSpan: { start: byteAt(textFrom), end: byteAt(linkFrom) }, wellFormed: true, children: [] },
    { kind: "element", name: "url", parameter: "javascript:alert(1)", span: { start: byteAt(linkFrom), end: byteAt(closeFrom) }, openingSpan: null, closingSpan: null, contentSpan: { start: byteAt(linkFrom), end: byteAt(closeFrom) }, wellFormed: true, children: [
      { kind: "text", name: null, parameter: null, span: { start: byteAt(linkFrom), end: byteAt(closeFrom) }, openingSpan: null, closingSpan: null, contentSpan: { start: byteAt(linkFrom), end: byteAt(closeFrom) }, wellFormed: true, children: [] },
    ] },
  ] }],
};

describe("preview panels", () => {
  it("renders formatted spoiler titles and leaves unsafe links inert", () => {
    render(<Preview source={source} nodes={analysis.nodes} onNavigate={vi.fn()} />);
    expect(screen.getByText("Важно").tagName).toBe("STRONG");
    expect(screen.getByText("ссылка").tagName).toBe("SPAN");
  });

  it("accepts only explicit external URL schemes", () => {
    expect(safeExternalUrl("https://4pda.to")).toBe("https://4pda.to/");
    expect(safeExternalUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
  });

  it("navigates from outline and diagnostics using byte spans", () => {
    const navigate = vi.fn();
    render(<><Outline nodes={analysis.nodes} onNavigate={navigate} /><Diagnostics diagnostics={analysis.diagnostics} onNavigate={navigate} /></>);
    fireEvent.click(screen.getByRole("treeitem", { name: /Важно/ }));
    fireEvent.click(screen.getByRole("button", { name: /Тег не закрыт/ }));
    expect(navigate).toHaveBeenNthCalledWith(1, analysis.nodes[0].span);
    expect(navigate).toHaveBeenNthCalledWith(2, { start: 0, end: 3 });
  });
});
