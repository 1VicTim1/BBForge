import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { InstalledPackage, Manifest } from "../src/plugins/types";

const pkg = (manifest: Partial<Manifest> & { id: string }, files: Record<string, string> = {}): InstalledPackage => ({
  manifest: { manifestVersion: 1, type: "plugin", name: manifest.id, version: "1.0.0", permissions: [], dependencies: {}, contributes: {}, ...manifest },
  enabled: true, signature: { state: "unsigned" }, tampered: false, errors: [], files, assets: {},
});

// A text service that dislikes "плохо", and a code checker that dislikes trailing commas.
const packages: InstalledPackage[] = [
  pkg({ id: "test.style", name: "Стиль", main: "main.js", permissions: ["scripts", "document.read"], contributes: { textCheck: { script: "check", title: "Стиль" } } }, {
    "main.js": `exports.check = async (bb, { text }) => {
  const found = [];
  for (let at = text.indexOf("плохо"); at >= 0; at = text.indexOf("плохо", at + 1)) found.push({ offset: at, length: 5, message: "Скажите мягче", replacements: ["неидеально"], kind: "style" });
  return found;
};`,
  }),
  pkg({ id: "test.json", name: "JSON", main: "main.js", permissions: ["scripts", "document.read"], contributes: { codeCheck: { script: "check", title: "JSON" } } }, {
    "main.js": `exports.check = async (bb, { code }) => {
  const at = code.search(/,\\s*[}\\]]/);
  return at >= 0 ? [{ offset: at, length: 1, message: "Лишняя запятая", severity: "error" }] : [];
};`,
  }),
];

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("analyzeWithRust", (source: string) => JSON.parse(execFileSync("target/debug/examples/analyze", [], { input: JSON.stringify(source) + "\n", encoding: "utf8" })));
  await page.addInitScript((items) => {
    window.__BBFORGE_PLUGINS__ = items;
    window.__BBFORGE_ANALYZE__ = async (request) => ({ ...request, analysis: await (window as unknown as { analyzeWithRust(source: string): Promise<import("../src/analysis/types").Analysis> }).analyzeWithRust(request.source) });
  }, packages);
  await page.goto("/");
});

test("a text service from a plugin underlines its remarks and fixes them from the context menu", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("Получилось [b]плохо[/b], но\n[spoiler=S]тоже плохо[/spoiler]");
  await expect(page.locator(".cm-grammar")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("bbforge-grammar"))).toBe(true);
  await page.locator(".cm-grammar").first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Стиль: Скажите мягче" })).toBeVisible();
  await page.getByRole("menuitem", { name: "«неидеально»" }).click();
  await expect(code).toHaveText("Получилось [b]неидеально[/b], но[spoiler=S]тоже плохо[/spoiler]");
  await expect(page.locator(".cm-grammar")).toHaveCount(1);
  await page.locator(".cm-grammar").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Пропустить замечание" }).click();
  await expect(page.locator(".cm-grammar")).toHaveCount(0);
});

test("a code checker from a plugin reports problems inside [code]", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill('Настройки:\n[code]{"a": 1,}[/code]');
  await expect(page.locator(".cm-problem-error")).toHaveCount(1);
  await expect(page.locator(".cm-problem-error")).toHaveText(",");
  await page.locator(".cm-problem-error").hover();
  await expect(page.getByText("JSON: Лишняя запятая")).toBeVisible();
  // Fixed code: the problem goes away with the next analysis.
  await page.locator(".cm-problem-error").click();
  await page.keyboard.press("Delete");
  await expect(code).toHaveText('Настройки:[code]{"a": 1}[/code]');
  await expect(page.locator(".cm-problem-error")).toHaveCount(0);
});
