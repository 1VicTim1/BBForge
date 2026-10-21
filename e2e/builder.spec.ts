import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.beforeEach(async ({ page }) => {
  await page.exposeFunction("analyzeWithRust", (source: string) => JSON.parse(execFileSync("target/debug/examples/analyze", [], { input: JSON.stringify(source) + "\n", encoding: "utf8" })));
  await page.addInitScript(() => {
    window.__BBFORGE_ANALYZE__ = async (request) => ({ ...request, analysis: await (window as unknown as { analyzeWithRust(source: string): Promise<import("../src/analysis/types").Analysis> }).analyzeWithRust(request.source) });
  });
  await page.goto("/");
});
test("roundtrips visual text and spoiler properties through Rust and shared Undo", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Текст блока" }).first()).toBeVisible();
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=Parent]hello[spoiler=Child]world[/spoiler][/spoiler]");
  await expect(page.getByRole("treeitem", { name: /Child/ })).toBeVisible();
  const text = page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "world" });
  await text.fill("мир😀");
  await expect(code).toContainText("мир😀");
  await page.getByRole("treeitem", { name: /Child/ }).click();
  await page.getByRole("button", { name: "Вынести наружу", exact: false }).click();
  await expect(code).toHaveText("[spoiler=Parent]hello[/spoiler][spoiler=Child]мир😀[/spoiler]");
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Parent]hello[spoiler=Child]мир😀[/spoiler][/spoiler]");
  await page.getByRole("button", { name: "Код", exact: true }).click();
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Parent]hello[spoiler=Child]world[/spoiler][/spoiler]");
});
test("previews a real Rust diagnostic fix, cancels it and then applies", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[b]текст");
  await expect(page.getByRole("button", { name: /Тег \[b\] не закрыт/ })).toBeVisible();
  await page.getByRole("button", { name: "Исправить…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Предпросмотр исправления" })).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(code).toHaveText("[b]текст");
  await page.getByRole("button", { name: "Исправить…", exact: true }).click();
  await page.getByRole("button", { name: "Применить исправление", exact: true }).click();
  await expect(code).toHaveText("[b]текст[/b]");
});
test("creates an editable empty spoiler and retains its history between modes", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("");
  await expect(page.getByRole("button", { name: "▣ Спойлер", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "▣ Спойлер", exact: true }).click();
  await page.getByRole("dialog", { name: "Создать спойлер" }).getByRole("textbox").fill("Новый");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Новый][/spoiler]");
  const text = page.locator(".builder-spoiler").getByRole("textbox", { name: "Текст блока" });
  await expect(text).toBeVisible();
  await text.fill("Содержимое");
  await expect(code).toHaveText("[spoiler=Новый]Содержимое[/spoiler]");
  await page.getByRole("button", { name: "Конструктор", exact: true }).click();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Новый][/spoiler]");
});
test("shows the IDE workspace with real structure and saves a design capture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("treeitem", { name: /Важная информация/ })).toBeVisible();
  const ratio = page.getByRole("separator", { name: "Соотношение кода и конструктора" });
  await ratio.focus(); await page.keyboard.press("ArrowRight");
  await expect(ratio).toHaveAttribute("aria-valuenow", "53");
  await page.screenshot({ path: "artifacts/bbforge-builder-preview.png" });
});
test("formats a visual Unicode selection with a chosen color", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=Title]я😀текст[/spoiler]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "я😀текст" });
  await expect(leaf).toHaveText("я😀текст");
  await leaf.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  await page.getByLabel("Цвет текста", { exact: true }).fill("#ff0000");
  await page.getByRole("button", { name: "Применить цвет текста", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Title][color=#ff0000]я😀текст[/color][/spoiler]");
});
test("moves a spoiler inside another using keyboard-accessible properties", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]");
  await page.getByRole("treeitem", { name: /A/ }).click();
  await page.getByRole("combobox", { name: "Целевой спойлер" }).selectOption({ label: "B" });
  await page.getByRole("button", { name: "Переместить внутрь", exact: true }).click();
  await expect(code).toHaveText("[spoiler=B]b[spoiler=A]a[/spoiler][/spoiler]");
});
test("does not lose IME composition when mode switching is requested", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=S]text[/spoiler]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "text" }); await expect(leaf).toHaveText("text");
  await leaf.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); element.textContent = "日本語";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
  });
  await page.getByRole("button", { name: "Код", exact: true }).click();
  await expect(page.locator(".builder-pane")).toBeVisible();
  await page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "日本語" }).evaluate((element) => { element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); element.dispatchEvent(new InputEvent("input", { bubbles: true })); });
  await expect(code).toHaveText("[spoiler=S]日本語[/spoiler]");
});
test("inserts a newline as source text without browser block markup", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=S]line[/spoiler]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "line" });
  await expect(leaf).toHaveText("line"); await leaf.click(); await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("next");
  await expect(code).toHaveText("[spoiler=S]line\nnext[/spoiler]", { useInnerText: true });
  expect(await leaf.locator("div,br:not([data-editor-sentinel]),p").count()).toBe(0);
});
