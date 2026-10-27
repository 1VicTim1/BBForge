import { expect, test } from "@playwright/test";
import type { InstalledPackage, Manifest } from "../src/plugins/types";

const pkg = (manifest: Partial<Manifest> & { id: string }, files: Record<string, string> = {}): InstalledPackage => ({
  manifest: { manifestVersion: 1, type: "plugin", name: manifest.id, version: "1.0.0", permissions: [], dependencies: {}, contributes: {}, ...manifest },
  enabled: true, signature: { state: "unsigned" }, tampered: false, errors: [], files, assets: {},
});

// One plugin adds a profile selector with an extension point, a second restyles it, a third adds a forum profile to it.
const packages: InstalledPackage[] = [
  pkg({ id: "victim.profile-selector", name: "Выбор профиля", permissions: ["ui.add", "ui.slots", "profiles.select"], contributes: {
    slots: [{ id: "victim.profile-selector.options", title: "Пункты селектора" }],
    ui: [{ op: "add", slot: "statusbar.right", before: "status.profile", item: { id: "victim.profile-selector.select", kind: "select", bind: "profile", source: "profiles", itemsSlot: "victim.profile-selector.options", title: "Профиль форума" } }],
  } }),
  pkg({ id: "victim.selector-style", permissions: ["styles", "ui.modify"], dependencies: { "victim.profile-selector": "^1" }, contributes: {
    styles: ["selector.css"], ui: [{ op: "update", target: "victim.profile-selector.select", set: { className: "fancy" } }],
  } }, { "selector.css": ".fancy .select-trigger { outline: 2px solid rgb(255, 215, 0); }" }),
  pkg({ id: "victim.forums", permissions: ["profiles"], contributes: { profiles: ["xen.json"] } },
    { "xen.json": JSON.stringify({ id: "xenforo", name: "XenForo", extends: "4pda", removeTags: ["spoiler"], tags: [{ name: "hide", as: "spoiler" }] }) }),
  pkg({ id: "victim.layout", permissions: ["ui.add", "ui.modify", "ui.remove", "commands", "document.edit"], contributes: {
    commands: [{ id: "victim.layout.hr", title: "Вставить разделитель", icon: "minus", run: { insert: "[hr]" } }],
    ui: [
      { op: "remove", target: "format.strike" },
      { op: "move", target: "format.code", before: "format.bold" },
      { op: "update", target: "menu.view", set: { title: "Отображение" } },
      { op: "add", slot: "toolbar.format", after: "format.list", item: { id: "victim.layout.hr-button", kind: "button", command: "victim.layout.hr", title: "Разделитель" } },
    ],
  } }),
  pkg({ id: "victim.night", type: "theme", permissions: ["themes"], contributes: { themes: [{ id: "night", name: "Ночь", base: "dark", tokens: { "--accent": "rgb(255, 0, 128)" } }] } }),
  pkg({ id: "evil.greedy", name: "Жадный", permissions: [], contributes: { styles: ["x.css"] } }, { "x.css": "body { display: none }" }),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((items) => { window.__BBFORGE_PLUGINS__ = items; }, packages);
  await page.goto("/");
  await expect(page.locator('[data-ui-id="victim.profile-selector.select"]')).toBeVisible();
});

test("plugins add a selector, restyle it and fill it with forum profiles", async ({ page }) => {
  const selector = page.locator('[data-ui-id="victim.profile-selector.select"]');
  await expect(selector).toHaveClass(/fancy/);
  await expect(selector.locator(".select-trigger")).toHaveCSS("outline-color", "rgb(255, 215, 0)");
  await expect(page.locator(".profile-badge")).toHaveText("4PDA");
  await selector.locator(".select-trigger").click();
  await expect(page.getByRole("option")).toHaveText(["4PDA", "XenForo"]);
  await page.getByRole("option", { name: "XenForo" }).click();
  await expect(page.locator(".profile-badge")).toHaveText("XenForo");
  await page.getByRole("button", { name: "Блоки" }).click();
  await expect(page.locator('[data-ui-id="block.spoiler"] code')).toHaveText("[hide=…]");
  // The greedy plugin asked for nothing, so its CSS is not applied.
  await expect(page.locator("body")).toBeVisible();
});

test("plugins reorder, rename and remove interface items and add commands", async ({ page }) => {
  const toolbar = page.locator('[data-ui-id="toolbar.format"]');
  await expect(toolbar.locator('[data-ui-id="format.strike"]')).toHaveCount(0);
  const ids = await toolbar.locator("[data-ui-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-ui-id")));
  expect(ids.indexOf("format.code")).toBeLessThan(ids.indexOf("format.bold"));
  expect(ids.indexOf("victim.layout.hr-button")).toBe(ids.indexOf("format.list") + 1);
  await expect(page.locator('[data-ui-id="menu.view"] > summary')).toHaveText("Отображение");

  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await toolbar.locator('[data-ui-id="victim.layout.hr-button"]').click();
  await expect(page.locator(".cm-content")).toContainText("[hr]");
});

test("themes from packages apply their tokens; packages without permissions get warnings", async ({ page }) => {
  await page.getByRole("button", { name: "Настройки" }).first().click();
  await page.getByRole("combobox", { name: "Тема" }).click();
  await page.getByRole("option", { name: "Ночь" }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("rgb(255, 0, 128)");
  await page.getByRole("button", { name: "Плагины и темы" }).click();
  const greedy = page.locator('[data-package-id="evil.greedy"]');
  await expect(greedy).toContainText("Без подписи");
  await expect(greedy).toContainText("нет разрешения «styles»");
});
