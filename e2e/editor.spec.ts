import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__BBFORGE_ANALYZE__ = async (request) => ({
      ...request,
      analysis: {
        tokens: [], nodes: [],
        diagnostics: request.source === "[b]" ? [{ code: "unclosedTag", severity: "error", message: "Тег [b] не закрыт", span: { start: 0, end: 3 }, line: 1, column: 1 }] : [],
      },
    });
  });
  await page.goto("/");
});

test("edits Cyrillic BBCode, searches, undoes and updates diagnostics", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("[b]");
  await expect(page.getByText("Тег [b] не закрыт")).toBeVisible();
  await expect(page.getByText(/изменён/)).toBeVisible();
  await page.keyboard.press("Control+f");
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("Важная информация");
});

test("toggles structure and preview panels", async ({ page }) => {
  await page.getByRole("button", { name: "Структура" }).click();
  await expect(page.getByRole("heading", { name: "Структура" })).toBeHidden();
  await page.getByRole("button", { name: "Предпросмотр" }).click();
  await expect(page.getByRole("heading", { name: "Предпросмотр" })).toBeVisible();
});

test("selects all and copies with physical keys on Russian layout", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:1420" });
  const code = page.locator(".cm-content");
  await code.fill("[b]Привет[/b]");
  await code.dispatchEvent("keydown", { key: "ф", code: "KeyA", ctrlKey: true });
  await page.keyboard.insertText("X");
  await expect(code).toHaveText("X");

  await code.fill("[b]Привет[/b]");
  await page.evaluate(() => navigator.clipboard.writeText("seed"));
  await code.dispatchEvent("keydown", { key: "ф", code: "KeyA", ctrlKey: true });
  await code.dispatchEvent("keydown", { key: "с", code: "KeyC", ctrlKey: true });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("[b]Привет[/b]");
});

test("keeps text and undo history independent across tabs", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("first");
  await page.getByRole("button", { name: /Новый/ }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await editor.fill("second");

  await page.getByRole("tab").nth(0).click();
  await expect(editor).toHaveText("first");
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("Моя новая тема");

  await page.getByRole("tab").nth(1).click();
  await expect(editor).toHaveText("second");
});

test("does not switch tabs while the editor is composing", async ({ page }) => {
  await page.getByRole("button", { name: /Новый/ }).click();
  const editor = page.locator(".cm-content");
  await editor.dispatchEvent("compositionstart", { data: "т" });
  await page.getByRole("tab").nth(0).click();
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await editor.dispatchEvent("compositionend", { data: "т" });
});

test("context menu shows only commands for the invoked surface and suppresses the native menu", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("text");
  await editor.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Контекстное меню" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Жирный" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Копировать видимый текст" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const prevented = await page.locator(".toolbar").evaluate((element) => !element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  expect(prevented).toBe(true);
});

test("context menu rejects a stale edit after the document changes", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("abc");
  await editor.press("Control+a");
  await editor.click({ button: "right" });
  await editor.fill("changed");
  await page.getByRole("menuitem", { name: "Жирный" }).click();
  await expect(page.getByRole("alert")).toContainText("Документ изменился");
  await expect(editor).toHaveText("changed");
});
