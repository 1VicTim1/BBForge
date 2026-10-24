import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Real Rust analysis of a real 4PDA header, so the structure, problems and builder are populated.
test.beforeEach(async ({ page }) => {
  await page.exposeFunction("analyzeWithRust", (source: string) => JSON.parse(execFileSync("target/debug/examples/analyze", [], { input: JSON.stringify(source) + "\n", encoding: "utf8" })));
  await page.addInitScript(() => {
    window.__BBFORGE_ANALYZE__ = async (request) => ({ ...request, analysis: await (window as unknown as { analyzeWithRust(source: string): Promise<import("../src/analysis/types").Analysis> }).analyzeWithRust(request.source) });
  });
});

const header = readFileSync("fixtures/4pda.bbcode", "utf8").slice(0, 6000) + "\n[color=#AAAAAAAAAAAA][/color]\n[ccasc][/ccasc]";

/** Controls whose text is clipped or spills out of their box. Ellipsis truncation is intentional and allowed. */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const visible = (element: Element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden"; };
    const problems: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("button, kbd, .status-item, .severity-chip, .rule-chip, .tag-label, .spoiler-count, .block-chip, .count-badge, .preview-badge, .select-trigger, label, h2, .crumb-root, .tree-item small, .palette-count, .scope-chip"))) {
      if (!visible(element) || !element.textContent?.trim() || element.getBoundingClientRect().width <= 1 || element.closest(".sr-only, [cmdk-label]")) continue;
      const style = getComputedStyle(element);
      if (style.textOverflow === "ellipsis" || element.closest(".cm-editor")) continue;
      const clipped = element.scrollWidth > element.clientWidth + 1 && style.overflowX !== "visible";
      const spill = Array.from(element.children).some((child) => { const inner = child.getBoundingClientRect(), outer = element.getBoundingClientRect(); return visible(child) && getComputedStyle(child).position !== "absolute" && getComputedStyle(child).textOverflow !== "ellipsis" && (inner.right > outer.right + 1 || inner.left < outer.left - 1); });
      // A control that fits its own box can still be cut off by a panel that hides overflow.
      let cut = false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.overflowX === "visible") continue;
        if (parentStyle.overflowX === "hidden" || parentStyle.overflowX === "clip") { const box = element.getBoundingClientRect(), outer = parent.getBoundingClientRect(); cut = box.right > outer.right + 1 || box.left < outer.left - 1; }
        break;
      }
      if (clipped || spill || cut) problems.push(`${element.tagName.toLowerCase()}.${element.className} «${element.textContent.trim().slice(0, 40)}» ${cut ? "cut off by its panel" : `${element.scrollWidth}>${element.clientWidth}`}`);
    }
    // Nothing may push the window into horizontal scrolling.
    if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls horizontally: ${document.documentElement.scrollWidth}>${window.innerWidth}`);
    return problems;
  });
}

for (const theme of ["dark", "light"] as const) for (const [width, height] of [[1440, 900], [1280, 720], [1024, 700]] as const) {
  test(`text and controls fit: ${theme} ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => localStorage.setItem("bbforge.preferences", JSON.stringify({ theme: value })), theme);
    await page.goto("/");
    await expect(page.locator(".sync-state")).toContainText("Синхронизирован");
    await page.locator(".cm-content").fill(header);
    await expect(page.locator(".sync-state")).toContainText("Синхронизировано");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("button", { name: /^Ошибки: / }).click();
    await page.getByRole("treeitem").filter({ hasText: "spoiler" }).first().click();
    // Popovers fade in; wait for that so the screenshots show them as the user sees them.
    const shot = async (name: string) => { await page.waitForTimeout(250); await page.screenshot({ path: `artifacts/redesign-${theme}-${width}-${name}.png` }); };
    expect(await overflowing(page)).toEqual([]);
    await shot("main");

    await page.getByRole("button", { name: "Код", exact: true }).click();
    await page.locator(".diagnostic-row").first().getByRole("button", { name: /Исправить/ }).click();
    await expect(page.getByRole("dialog", { name: "Исправления" })).toBeVisible();
    expect(await overflowing(page)).toEqual([]);
    await shot("quickfix");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
    expect(await overflowing(page)).toEqual([]);
    await shot("preview");
    await page.getByRole("button", { name: "Конструктор", exact: true }).click();
    await page.getByRole("button", { name: "Рядом", exact: true }).click();

    await page.keyboard.press("Control+Shift+KeyP");
    await page.getByRole("dialog", { name: "Палитра команд" }).locator("input").fill(">пуст");
    expect(await overflowing(page)).toEqual([]);
    await shot("palette");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Экспорт" }).click();
    expect(await overflowing(page)).toEqual([]);
    await shot("export");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+Alt+KeyS");
    await expect(page.getByRole("region", { name: "Настройки" })).toBeVisible();
    await page.getByRole("combobox", { name: "Тема" }).click();
    expect(await overflowing(page)).toEqual([]);
    await shot("settings");
    await page.keyboard.press("Escape");
  });
}

test("compact density keeps every control readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem("bbforge.preferences", JSON.stringify({ density: "compact" })));
  await page.goto("/");
  await expect(page.locator(".sync-state")).toContainText("Синхронизирован");
  await page.locator(".cm-content").fill(header);
  await expect(page.locator(".sync-state")).toContainText("Синхронизировано");
  await page.getByRole("button", { name: /^Ошибки: / }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  expect(await overflowing(page)).toEqual([]);
  await page.screenshot({ path: "artifacts/redesign-dark-compact.png" });
});
