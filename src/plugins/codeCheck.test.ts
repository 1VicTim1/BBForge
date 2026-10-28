import { describe, expect, it, vi } from "vitest";
import type { Analysis, Node } from "../analysis/types";
import { CodeChecker, codeBlocks, withPluginDiagnostics } from "./codeCheck";

const text = (start: number, end: number): Node => ({ kind: "text", name: null, parameter: null, span: { start, end }, contentSpan: { start, end }, openingSpan: null, closingSpan: null, wellFormed: true, children: [] });
/** "я [code]{"a": 1,}[/code]" — byte offsets: "я " is 3 bytes. */
const source = 'я [code]{"a": 1,}[/code]';
const analysis: Analysis = {
  tokens: [], diagnostics: [{ code: "own", severity: "info", message: "own", span: { start: 0, end: 1 }, line: 1, column: 1 }],
  nodes: [text(0, 3), { kind: "element", name: "code", parameter: null, span: { start: 3, end: 25 }, contentSpan: { start: 9, end: 18 }, openingSpan: { start: 3, end: 9 }, closingSpan: { start: 18, end: 25 }, wellFormed: true, children: [text(9, 18)] }],
};

describe("code check", () => {
  it("finds [code] blocks", () => {
    expect(codeBlocks(analysis, source)).toEqual([{ from: 8, to: 17, code: '{"a": 1,}', language: null }]);
  });

  it("asks each checker once per block text and places its findings in the source", async () => {
    const run = vi.fn(async () => [{ offset: 7, length: 1, message: "Лишняя запятая", severity: "error" }, { offset: 50, length: 1, message: "мимо" }]);
    const checker = new CodeChecker([{ owner: "test.code", fn: "check", title: "Код" }], run);
    expect(checker.cached(analysis, source)).toEqual([]);
    expect(await checker.refresh(analysis, source)).toBe(true);
    expect(await checker.refresh(analysis, source)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    const [found] = checker.cached(analysis, source);
    expect(found).toMatchObject({ code: "plugin:test.code", severity: "error", message: "Код: Лишняя запятая", line: 1, column: 16, span: { start: 16, end: 17 } });
    expect(new TextDecoder().decode(new TextEncoder().encode(source).slice(16, 17))).toBe(",");
    const merged = withPluginDiagnostics(analysis, [found]);
    expect(merged.diagnostics.map((item) => item.code)).toEqual(["own", "plugin:test.code"]);
    expect(withPluginDiagnostics(merged, []).diagnostics.map((item) => item.code)).toEqual(["own"]);
  });
});
