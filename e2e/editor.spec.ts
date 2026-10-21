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
  await expect(page.getByRole("heading", { name: "Предпросмотр" })).toBeHidden();
});
