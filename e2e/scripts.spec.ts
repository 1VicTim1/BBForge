import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { InstalledPackage, Manifest } from "../src/plugins/types";

const pkg = (manifest: Partial<Manifest> & { id: string }, files: Record<string, string> = {}): InstalledPackage => ({
  manifest: { manifestVersion: 1, type: "plugin", name: manifest.id, version: "1.0.0", permissions: [], dependencies: {}, contributes: {}, ...manifest },
  enabled: true, signature: { state: "unsigned" }, tampered: false, errors: [], files, assets: {},
});

const packages: InstalledPackage[] = [
  pkg({ id: "victim.base", name: "База", main: "main.js", exports: ["session"], permissions: ["scripts", "storage"] }, {
    "main.js": `exports.session = async (bb) => { const count = ((await bb.storage.get("count")) || 0) + 1; await bb.storage.set("count", count); return "сессия-" + count; };
exports.secret = async () => "не для чужих";`,
  }),
  pkg({ id: "victim.user", name: "Пользователь", main: "main.js", dependencies: { "victim.base": "^1" }, permissions: ["scripts", "commands", "document.edit"], contributes: {
    commands: [
      { id: "victim.user.go", title: "Код поста (тест)", run: { script: "go" } },
      { id: "victim.user.hang", title: "Зависнуть (тест)", run: { script: "hang" } },
      { id: "victim.user.steal", title: "Чужая функция (тест)", run: { script: "steal" } },
      { id: "victim.user.toggle", title: "Переключатель", run: { script: "toggle" } },
    ],
  } }, {
    "main.js": `exports.go = async (bb) => {
  const link = await bb.ui.prompt({ title: "Ссылка на пост", label: "Пост", value: await bb.document.selection() });
  if (!link) return;
  const session = await bb.plugins.call("victim.base", "session");
  const [item] = await bb.html.query("<textarea id=t>[b]код " + link + "[/b]</textarea>", "#t");
  let denied = "";
  try { await bb.http.get("https://example.com/"); } catch (error) { denied = error.message; }
  const text = item.text + " | " + session + " | fetch:" + typeof fetch + " | " + denied;
  if (await bb.ui.review({ title: "Код поста", text }) === "insert") await bb.document.insert(text);
};
exports.hang = () => { for (;;) {} };
exports.steal = (bb) => bb.plugins.call("victim.base", "secret");
exports.activate = (bb) => bb.commands.update("victim.user.toggle", { title: "Переключатель: выкл" });
exports.toggle = (bb) => bb.commands.update("victim.user.toggle", { title: "Переключатель: вкл" });`,
  }),
];

const command = async (page: import("@playwright/test").Page, title: string) => {
  await page.keyboard.press("Control+Shift+KeyP");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((items) => { window.__BBFORGE_PLUGINS__ = items; }, packages);
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
});

test("a sandboxed script asks, calls its dependency and inserts the result", async ({ page }) => {
  await command(page, "Код поста (тест)");
  const prompt = page.getByRole("dialog", { name: "Ссылка на пост" });
  await expect(prompt).toContainText("Пользователь");
  await prompt.getByRole("textbox", { name: "Пост" }).fill("123");
  await prompt.getByRole("button", { name: "OK" }).click();
  const review = page.getByRole("dialog", { name: "Код поста" });
  await expect(review.getByLabel("Результат")).toHaveText("[b]код 123[/b] | сессия-1 | fetch:undefined | Нет разрешения «network:example.com»");
  await review.getByRole("button", { name: "Вставить в документ" }).click();
  await expect(page.locator(".cm-content")).toContainText("[b]код 123[/b] | сессия-1");
});

test("a plugin cannot call functions its dependency does not export", async ({ page }) => {
  await command(page, "Чужая функция (тест)");
  await expect(page.getByRole("alert")).toContainText("Пользователь: Плагин victim.base не открывает функцию secret");
});

test("a script that hangs is stopped", async ({ page }) => {
  test.setTimeout(40_000);
  await command(page, "Зависнуть (тест)");
  await expect(page.getByRole("alert")).toContainText("Пользователь: Плагин не отвечает и был остановлен", { timeout: 20_000 });
});

test("a script renames its own command on load and when run", async ({ page }) => {
  await page.keyboard.press("Control+Shift+KeyP");
  await page.keyboard.type("Переключатель");
  await expect(page.getByRole("option", { name: /Переключатель: выкл/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Shift+KeyP");
  await page.keyboard.type("Переключатель");
  await expect(page.getByRole("option", { name: /Переключатель: вкл/ })).toBeVisible();
});

test("an image preview plugin shows pictures of its hosts and leaves the rest as placeholders", async ({ page }) => {
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await page.addInitScript(([items, image]) => {
    window.__BBFORGE_PLUGINS__ = [...(window.__BBFORGE_PLUGINS__ ?? []), ...items].map((item) => item.manifest.id === "victim.images" ? { ...item, files: { "main.js": `exports.preview = async (bb, { url }) => url.includes("allowed") ? ${JSON.stringify(image)} : null;` } } : item);
  }, [[pkg({ id: "victim.images", main: "main.js", permissions: ["scripts", "network:4pda.to"], contributes: { imagePreview: { script: "preview" } } })], pixel] as const);
  // The preview needs the document's structure: the real analyser.
  await page.exposeFunction("analyzeWithRust", (source: string) => JSON.parse(execFileSync("target/debug/examples/analyze", [], { input: JSON.stringify(source) + "\n", encoding: "utf8" })));
  await page.addInitScript(() => {
    window.__BBFORGE_ANALYZE__ = async (request) => ({ ...request, analysis: await (window as unknown as { analyzeWithRust(source: string): Promise<import("../src/analysis/types").Analysis> }).analyzeWithRust(request.source) });
  });
  await page.goto("/");
  await page.locator(".cm-content").fill("[img]https://4pda.to/s/allowed.png[/img]\n[img]https://evil.example/x.png[/img]");
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect(page.locator(".preview-image")).toHaveCount(1);
  await expect(page.locator(".rendered-post .media-placeholder")).toHaveCount(1);
  await page.getByRole("button", { name: "Конструктор", exact: true }).click();
  await expect(page.locator(".builder-thumbnail")).toHaveCount(1);
});
