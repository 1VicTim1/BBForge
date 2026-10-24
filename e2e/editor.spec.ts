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
  await expect(page.locator(".sync-state")).toContainText("Синхронизирован");
});

test("edits Cyrillic BBCode, searches, undoes and updates diagnostics", async ({ page }) => {
  await page.getByRole("button", { name: /^Ошибки: / }).click();
  const editor = page.locator(".cm-content");
  await editor.fill("[b]");
  await expect(page.getByText("Тег [b] не закрыт")).toBeVisible();
  await expect(page.getByLabel("Есть несохранённые изменения")).toBeVisible();
  await page.keyboard.press("Control+f");
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("Важная информация");
});

test("toggles structure and preview panels", async ({ page }) => {
  await page.getByRole("button", { name: "Структура" }).click();
  await expect(page.getByRole("heading", { name: "Структура" })).toBeHidden();
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect(page.getByRole("region", { name: "Предпросмотр" })).toBeVisible();
  await expect(page.locator(".preview-badge")).toContainText("Приблизительный рендер");
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

test("workspace recovery restores multiple unsaved tabs and their active document", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.fill("first unsaved");
  await page.getByRole("button", { name: /Новый/ }).click();
  await editor.fill("second unsaved");
  await page.getByRole("tab").nth(0).click();
  await expect(editor).toHaveText("first unsaved");
  await page.waitForTimeout(550);

  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(editor).toHaveText("first unsaved");
  await page.getByRole("tab").nth(1).click();
  await expect(editor).toHaveText("second unsaved");
  await page.keyboard.press("Control+z");
  await expect(editor).toHaveText("second unsaved");
});

test("restores cursor and scroll positions independently for every document surface", async ({ page }) => {
  const source = Array.from({ length: 90 }, (_, index) => `[spoiler=Раздел ${index}]Строка ${index}[/spoiler]`).join("\n");
  const editor = page.locator(".cm-content");
  await editor.fill(source);
  await page.locator(".sync-state").getByText("Синхронизировано").waitFor();
  await editor.click();
  await page.keyboard.press("Control+End");
  await expect(page.locator(".statusbar")).toContainText("Стр 90,");
  const codeScroller = page.locator(".cm-scroller");
  await codeScroller.evaluate((node) => { node.scrollTop = 420; node.dispatchEvent(new Event("scroll")); });
  const builder = page.locator(".builder");
  await builder.evaluate((node) => { node.scrollTop = 360; node.dispatchEvent(new Event("scroll")); });
  await page.getByRole("textbox", { name: "Текст блока" }).last().click();
  await page.keyboard.press("End");

  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  const preview = page.locator(".rendered-post");
  await preview.evaluate((node) => { node.scrollTop = 280; node.dispatchEvent(new Event("scroll")); });
  const previewTop = await preview.evaluate((node) => node.scrollTop);
  await page.getByRole("button", { name: "Конструктор", exact: true }).click();
  const codeTop = await codeScroller.evaluate((node) => node.scrollTop);
  const builderTop = await builder.evaluate((node) => node.scrollTop);

  await page.getByRole("button", { name: "Новый документ", exact: true }).click();
  await page.getByRole("tab").first().click();

  await expect.poll(() => codeScroller.evaluate((node) => node.scrollTop)).toBe(codeTop);
  await expect.poll(() => builder.evaluate((node) => node.scrollTop)).toBe(builderTop);
  await expect(page.locator(".statusbar")).toContainText("Стр 90,");
  await expect(page.locator(".visual-text:focus")).toBeVisible();
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect.poll(() => preview.evaluate((node) => node.scrollTop)).toBe(previewTop);
});
