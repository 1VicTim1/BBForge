import { describe, expect, it } from "vitest";
import type { Analysis, Node } from "../analysis/types";
import { checkRules, validateRuleSets } from "./rules";
import { activeProfile, builtinOf } from "./profile";

const encoder = new TextEncoder();
const span = (source: string, from: number, to: number) => ({ start: encoder.encode(source.slice(0, from)).length, end: encoder.encode(source.slice(0, to)).length });
const element = (source: string, name: string, from: number, to: number, children: Node[] = [], parameter: string | null = null, content?: [number, number]): Node => ({
  kind: "element", name, parameter, children, span: span(source, from, to), openingSpan: span(source, from, from + 1),
  contentSpan: content ? span(source, content[0], content[1]) : span(source, from, to), closingSpan: span(source, to - 1, to), wellFormed: true,
});
const analysis = (nodes: Node[]): Analysis => ({ nodes, diagnostics: [], tokens: [] });

describe("section rules", () => {
  const [devices] = validateRuleSets(activeProfile().ruleSets);
  it("are part of the built-in 4PDA profile", () => {
    expect(activeProfile().ruleSets.map((set) => set.id)).toEqual(["devices", "apps", "games", "pc"]);
    expect(devices.rules.map((rule) => rule.type)).toEqual(["maxCount", "maxCount", "insideOnly"]);
  });
  it("count spoilers and pictures, and want pictures under a spoiler", () => {
    const source = "[img]https://x/a.png[/img][attachment=\"1:fw.zip\"][spoiler]x[/spoiler]";
    const image = element(source, "img", 0, 26, [], null, [5, 20]);
    const archive = element(source, "attachment", 26, 50, [], "1:fw.zip");
    const spoilers = Array.from({ length: 11 }, () => element(source, "spoiler", 50, 71));
    const problems = checkRules(analysis([image, archive, ...spoilers]), source, devices, builtinOf);
    expect(problems.map((item) => item.code)).toEqual(["rule:devices.spoilers", "rule:devices.photos-hidden"]);
    expect(problems[0].message).toContain("сейчас 11, можно 10");
    expect(problems[1]).toMatchObject({ line: 1, column: 1 });
  });
  it("ask for missing header fields and too long posts", () => {
    const [set] = validateRuleSets([{ id: "s", rules: [{ id: "a", type: "requiredText", pattern: "Требуется Android", message: "Нет поля", severity: "info" }, { id: "l", type: "maxLength", max: 5, message: "Длинно" }, { id: "bad", type: "requiredText", pattern: "(", message: "x" }] }]);
    expect(set.rules).toHaveLength(2);
    const problems = checkRules(analysis([]), "строка\nвторая", set, builtinOf);
    expect(problems.map((item) => [item.code, item.severity])).toEqual([["rule:s.a", "info"], ["rule:s.l", "warning"]]);
    expect(checkRules(analysis([]), "Требуется Android: 8", set, builtinOf).map((item) => item.code)).toEqual(["rule:s.l"]);
  });
});
