import { describe, expect, it } from "vitest";
import { THEME_TOKENS, safeTokenValue, validateTheme } from "./themes";

describe("themes", () => {
  it("allows exactly the design tokens of tokens.css", async () => {
    // node:fs without @types/node: the module name is a plain string, so it is typed as any.
    const fs = await import(/* @vite-ignore */ "node:fs" as string);
    const css: string = fs.readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
    expect([...THEME_TOKENS].sort()).toEqual([...new Set([...css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map((match) => match[1]))].sort());
  });
  it("accepts colours and lengths, rejects anything that could load or inject", () => {
    for (const value of ["#2E3440", "rgba(136, 192, 208, .16)", "6px", "0 12px 32px rgba(0, 0, 0, .45)", "'Inter', sans-serif"]) expect(safeTokenValue(value), value).toBe(true);
    for (const value of ["url(https://x)", "red; background: blue", "expression(alert(1))", "}body{", "\\61"]) expect(safeTokenValue(value), value).toBe(false);
  });
  it("keeps valid tokens and reports the rest", () => {
    const { theme, problems } = validateTheme({ id: "night", name: "Ночь", base: "light", tokens: { "--accent": "#ff0080", "--nope": "red", "--text": "url(x)" } }, "a.b");
    expect(theme).toMatchObject({ id: "night", base: "light", tokens: { "--accent": "#ff0080" }, source: "a.b" });
    expect(problems).toHaveLength(2);
    expect(validateTheme({ id: "dark", tokens: {} }, "a.b").theme).toBeNull();
  });
});
