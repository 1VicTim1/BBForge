import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("visual Undo and Redo use the physical key in Russian layout", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=S]hello[/spoiler]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }); await expect(leaf).toHaveText("hello");
  await leaf.fill("changed");
  await leaf.dispatchEvent("keydown", { key: "я", code: "KeyZ", ctrlKey: true });
  await expect(code).toHaveText("[spoiler=S]hello[/spoiler]");
  await leaf.dispatchEvent("keydown", { key: "Я", code: "KeyZ", ctrlKey: true, shiftKey: true });
  await expect(code).toHaveText("[spoiler=S]changed[/spoiler]");
});

test("code Undo uses the physical key in Russian layout", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("hello");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.waitForTimeout(550);
  await code.press("End"); await page.keyboard.type("X");
  await code.dispatchEvent("keydown", { key: "я", code: "KeyZ", ctrlKey: true });
  await expect(code).toHaveText("hello");
});

test("insert-in-spoiler keeps a draft until Enter or blur", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=S][b]hello[/b][/spoiler]");
  await page.getByRole("button", { name: "+ Вставить в спойлер", exact: true }).click();
  await page.keyboard.type("tail");
  await expect(code).toHaveText("[spoiler=S][b]hello[/b][/spoiler]");
  await page.keyboard.press("Enter");
  await expect(code).toHaveText("[spoiler=S][b]hello[/b]tail[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.getByRole("button", { name: "+ Вставить в спойлер", exact: true }).click();
  await page.keyboard.type("more");
  await expect(code).toHaveText("[spoiler=S][b]hello[/b]tail[/spoiler]");
  await page.locator(".builder-caption").click();
  await expect(code).toHaveText("[spoiler=S][b]hello[/b]tailmore[/spoiler]");
});

test("repairs crossed closing runs without deleting formatting", async ({ page }) => {
  await page.locator(".collapsed-problems").click();
  const code = page.locator(".cm-content");
  for (const [source, expected] of [
    ["[size=1][color=grey]fire[/size][/color]", "[size=1][color=grey]fire[/color][/size]"],
    ['[i][color=green][b]текст [color="#0099FF"]ссылка[/color] текст[/color][/i][/b]', '[i][color=green][b]текст [color="#0099FF"]ссылка[/color] текст[/b][/color][/i]'],
  ]) {
    await code.fill(source);
    await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
    await page.getByRole("button", { name: "Исправить однозначные…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Предпросмотр исправления" })).toBeVisible();
    await page.getByRole("button", { name: "Применить исправление", exact: true }).click();
    await expect(code).toHaveText(expected);
    await expect(page.locator(".diagnostics .count-badge")).toHaveText("0");
  }
});

test("does not render recovery closing tags as visual text", async ({ page }) => {
  const code = page.locator(".cm-content");
  const source = '[img]https://4pda.to/static/forum/style_images/f/281-firmware.png[/img] [size=1][color=grey]fire[/size][/color]\n[i][color=green][b]В теме нет куратора. [color="#0099FF"]модераторам[/color] раздела[/color][/i][/b]';
  await code.fill(source);
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const visual = page.locator(".builder-page");
  await expect(visual).not.toContainText("Повреждённая разметка");
  await expect(visual).toContainText("В теме нет куратора");
  await expect(visual).not.toContainText("[/color]");
  await expect(visual).not.toContainText("[/b]");
  expect((await page.locator(".cm-line").allTextContents()).join("\n")).toBe(source);
});

test("repairs a crossing tag without deleting the recovered formatting", async ({ page }) => {
  await page.locator(".collapsed-problems").click();
  const code = page.locator(".cm-content");
  await code.fill("[b][i]a[/b]tail[/i]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.getByRole("button", { name: "Исправить однозначные…", exact: true }).click();
  await page.getByRole("button", { name: "Применить исправление", exact: true }).click();
  await expect(code).toHaveText("[b][i]a[/i][/b][i]tail[/i]");
});

test("keeps visual typing coherent through Undo and formatting", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=S]hello[/spoiler]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }); await expect(leaf).toHaveText("hello");
  await leaf.click(); await page.keyboard.press("End"); await page.keyboard.type("X");
  await page.keyboard.press("Control+z"); await page.keyboard.type("Q");
  await expect(code).toHaveText("[spoiler=S]helloQ[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.keyboard.press("Control+b");
  await expect(code).toHaveText("[spoiler=S]helloQ[b][/b][/spoiler]");
});

test("protects IME from toolbar history and pastes literal text inside code", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[code]abc[/code]");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }); await expect(leaf).toHaveText("abc");
  await leaf.click(); await page.keyboard.press("End");
  await leaf.evaluate((element) => { const data = new DataTransfer(); data.setData("text/plain", "[b]literal[/b]"); element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(code).toHaveText("[code]abc[b]literal[/b][/code]");
  await leaf.dispatchEvent("compositionstart");
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await leaf.evaluate((element) => { element.textContent += "日本語"; });
  await leaf.dispatchEvent("compositionend");
  await expect(code).toHaveText("[code]abc[b]literal[/b]日本語[/code]");
});

test("rejects stale drag identity and list-item escape", async ({ page }) => {
  const code = page.locator(".cm-content"); await code.fill("[spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]");
  await expect(page.getByRole("treeitem", { name: /A/ })).toBeVisible();
  const payload = await page.getByRole("treeitem", { name: /A/ }).evaluate((element) => { const data = new DataTransfer(); element.parentElement!.dispatchEvent(new DragEvent("dragstart", { dataTransfer: data, bubbles: true })); return data.getData("application/bbforge-node"); });
  await code.fill("[spoiler=C]c[/spoiler][spoiler=B]b[/spoiler]");
  await expect(page.getByRole("treeitem", { name: /C/ })).toBeVisible();
  await page.getByRole("treeitem", { name: /B/ }).evaluate((element, value) => { const data = new DataTransfer(); data.setData("application/bbforge-node", value); element.parentElement!.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true })); }, payload);
  await expect(code).toHaveText("[spoiler=C]c[/spoiler][spoiler=B]b[/spoiler]");
  await code.fill("[list][*]a[/list][spoiler=S]b[/spoiler]");
  await expect(page.getByRole("treeitem", { name: "◇ *" })).toBeVisible();
  const item = page.getByRole("treeitem", { name: "◇ *" });
  await item.dragTo(page.getByRole("treeitem", { name: /S spoiler/ }));
  await expect(code).toHaveText("[list][*]a[/list][spoiler=S]b[/spoiler]");
});

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
  await page.locator(".collapsed-problems").click();
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
  await expect(page.getByRole("button", { name: "＋ Спойлер", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "＋ Спойлер", exact: true }).click();
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
test("creates a child spoiler inside the selected spoiler", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=Parent]text[/spoiler]");
  const parent = page.locator(".builder-spoiler").filter({ hasText: "Parent" });
  await parent.locator("summary").click();
  await page.locator("button.new-spoiler").click();
  await page.getByRole("dialog", { name: "Создать спойлер" }).getByRole("textbox").fill("Child");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(code).toHaveText("[spoiler=Parent]text[spoiler=Child][/spoiler][/spoiler]");
});
test("keeps a selected spoiler while toggling formatting and toggles a tag beside the code cursor", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[b][spoiler=S]text[/spoiler][/b]");
  await page.locator(".builder-spoiler summary").click();
  const bold = page.getByRole("button", { name: "Жирный" });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(code).toHaveText("[spoiler=S]text[/spoiler]");

  await code.fill("[i]word[/i]");
  await code.click();
  await page.keyboard.press("Home");
  const italic = page.getByRole("button", { name: "Курсив" });
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await italic.click();
  await expect(code).toHaveText("word");
});

test("drags visual spoilers by their surface without handles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await expect(page.locator(".visual-drag-handle")).toHaveCount(0);
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, ctrl = false) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    if (ctrl) await page.keyboard.down("Control");
    await page.mouse.up();
    if (ctrl) await page.keyboard.up("Control");
  };
  const box = async (title: string, part = "summary") => { const head = page.locator(".builder-spoiler > summary").filter({ hasText: new RegExp(`^\\s*${title}\\s*spoiler$`) }); const result = await (part === "summary" ? head : page.locator(".builder-spoiler").filter({ has: page.locator(":scope > summary").filter({ hasText: new RegExp(`^\\s*${title}\\s*spoiler$`) }) })).first().boundingBox(); if (!result) throw new Error(`no spoiler ${title}`); return result; };
  let a = await box("A"), b = await box("B", "block");
  await drag({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + 40, y: b.y + b.height + 90 });
  await expect(code).toHaveText("[spoiler=B]b[/spoiler][spoiler=A]a[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  a = await box("A");
  const insertB = (await page.locator(".builder-spoiler").filter({ hasText: "B" }).getByRole("button", { name: "+ Вставить в спойлер" }).boundingBox())!;
  await drag({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: insertB.x + insertB.width + 30, y: insertB.y + insertB.height / 2 });
  await expect(code).toHaveText("[spoiler=B]b[spoiler=A]a[/spoiler][/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  a = await box("A"); b = await box("B");
  await drag({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + 40, y: b.y + 2 }, true);
  await expect(code).toHaveText("[spoiler=A]a[/spoiler][spoiler=B]b[spoiler=A]a[/spoiler][/spoiler]");
});

test("drops a spoiler between siblings, out of its parent and into text with a ghost", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=P][spoiler=A]a[/spoiler][spoiler=B]b[/spoiler][spoiler=C]c[/spoiler][/spoiler]hello world");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const summary = async (title: string) => (await page.locator(".builder-spoiler > summary").filter({ hasText: new RegExp(`^\\s*${title}\\s*spoiler$`) }).first().boundingBox())!;
  const grab = async (title: string) => { const c = await summary(title); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down(); };
  await grab("C");
  const b = await summary("B");
  await page.mouse.move(b.x + 60, b.y + 4, { steps: 10 });
  await expect(page.locator(".visual-drop-ghost")).toBeVisible();
  await expect(page.locator(".visual-drag-preview")).toBeVisible();
  await page.mouse.up();
  await expect(code).toHaveText("[spoiler=P][spoiler=A]a[/spoiler][spoiler=C]c[/spoiler][spoiler=B]b[/spoiler][/spoiler]hello world");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await expect(page.locator(".visual-drop-ghost")).toHaveCount(0);
  await grab("A");
  const p = await summary("P");
  await page.mouse.move(p.x + 60, p.y + 3, { steps: 10 });
  await page.mouse.up();
  await expect(code).toHaveText("[spoiler=A]a[/spoiler][spoiler=P][spoiler=C]c[/spoiler][spoiler=B]b[/spoiler][/spoiler]hello world");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await grab("B");
  const leaf = page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "hello world" });
  let text = (await leaf.boundingBox())!;
  await page.mouse.move(text.x + text.width * 5.5 / 11, text.y + text.height / 2, { steps: 10 });
  text = (await leaf.boundingBox())!;
  await page.mouse.move(text.x + text.width * 5.5 / 11, text.y + text.height / 2, { steps: 2 });
  await expect(page.locator(".visual-drop-caret")).toBeVisible();
  await page.mouse.up();
  await expect(code).toHaveText(/^\[spoiler=A\]a\[\/spoiler\]\[spoiler=P\]\[spoiler=C\]c\[\/spoiler\]\[\/spoiler\]hello ?\[spoiler=B\]b\[\/spoiler\] ?world$/);
});

test("drags a partially selected formatted fragment and copies it with Ctrl", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[b]very long[/b] plain");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const leaves = page.getByRole("textbox", { name: "Текст блока" });
  const bold = await leaves.nth(0).boundingBox(), plain = await leaves.nth(1).boundingBox();
  if (!bold || !plain) throw new Error("visual leaves are not visible");
  const charWidth = bold.width / "very long".length, y = bold.y + bold.height / 2;
  await page.mouse.move(bold.x + charWidth * 5 + 1, y); await page.mouse.down();
  await page.mouse.move(bold.x + bold.width - 1, y, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("bbforge-selection"))).toBe(true);
  await page.mouse.move(bold.x + charWidth * 7, y); await page.mouse.down();
  await page.mouse.move(plain.x + plain.width - 1, plain.y + plain.height / 2, { steps: 10 });
  await expect(page.locator(".visual-drop-caret")).toBeVisible();
  await page.mouse.up();
  await expect(code).toHaveText("[b]very [/b] plain[b]long[/b]");
});

test("selects visual text across separate formatted fragments", async ({ page }) => {
  await page.locator(".cm-content").fill("[url=https://example.com]AFH[/url] и [b]дальше[/b] конец");
  const leaves = page.getByRole("textbox", { name: "Текст блока" });
  await expect(leaves).toHaveCount(4);
  const first = await leaves.nth(0).boundingBox(), last = await leaves.nth(3).boundingBox();
  if (!first || !last) throw new Error("visual leaves are not visible");
  await page.mouse.move(first.x + 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 2, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("bbforge-selection"))).toBe(true);
  await page.getByRole("button", { name: "Жирный" }).click();
  await page.getByRole("button", { name: "Применить исправление", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("[b][url=https://example.com]AFH[/url] и [b]дальше[/b] конец[/b]");
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

test("preview copy offers BBCode without and with surrounding formatting and source navigation", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:1420" });
  const code = page.locator(".cm-content"); await code.fill("[b]abcdef[/b]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.getByRole("button", { name: "Предпросмотр" }).click();
  const leaf = page.locator(".rendered-post [data-source-from='3'][data-source-to='9']");
  await leaf.evaluate((element) => {
    const text = element.firstChild!; const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 4);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await leaf.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Копировать BBCode без внешнего оформления" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("cd");
  await leaf.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Копировать BBCode с оформлением" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("[b]cd[/b]");

  await page.getByRole("button", { name: "К исходнику" }).click();
  await page.keyboard.type("X");
  await expect(code).toHaveText("[b]abXef[/b]");
});

test("preview context menu preserves and copies a selection across nested siblings", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:1420" });
  const source = "[b][i][color=Green]Куратор темы [/color][url=https://example.com][color=Blue]~VicTim~[/color][/url][color=Green] по вопросам наполнения и актуализации шапки обращаться в QMS[/color][/i][/b]";
  await page.locator(".cm-content").fill(source);
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.getByRole("button", { name: "Предпросмотр" }).click();
  const preview = page.locator(".rendered-post");
  await preview.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      if (text.data.includes("Куратор темы") || text.data.includes("~VicTim~") || text.data.includes("по вопросам")) texts.push(text);
    }
    const range = document.createRange();
    range.setStart(texts[0], 0);
    range.setEnd(texts.at(-1)!, texts.at(-1)!.data.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    texts.at(-1)!.parentElement!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await preview.getByText("~VicTim~", { exact: true }).click({ button: "right" });
  await expect.poll(() => preview.evaluate(() => window.getSelection()?.toString())).toBe("Куратор темы ~VicTim~ по вопросам наполнения и актуализации шапки обращаться в QMS");
  await page.getByRole("menuitem", { name: "Копировать BBCode с оформлением" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);
});

test("reports forum-escaped tags as info and lets the user remove them", async ({ page }) => {
  await page.locator(".collapsed-problems").click();
  const code = page.locator(".cm-content");
  await code.fill("a &#91;LIST&#93;b&#91;/LIST&#93;");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const rows = page.locator(".diagnostic.info");
  await expect(rows).toHaveCount(2);
  await page.locator(".diagnostic-row").first().getByRole("button", { name: "Исправить…" }).click();
  await expect(page.getByRole("radiogroup", { name: "Варианты исправления" })).toBeVisible();
  await page.getByRole("button", { name: "Применить исправление", exact: true }).click();
  await expect(code).toHaveText("a b&#91;/LIST&#93;");
});

test("a selected spoiler is not dragged as text, and an unchanged drop shows no ghost", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=P][spoiler=A]alpha[/spoiler][spoiler=B]beta[/spoiler][/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const head = (title: string) => page.locator(".builder-spoiler > summary").filter({ hasText: new RegExp(`^\\s*${title}\\s*spoiler$`) });
  await head("P").click();
  await head("P").click();
  const alpha = (await page.getByRole("textbox", { name: "Текст блока" }).filter({ hasText: "alpha" }).boundingBox())!;
  await page.mouse.move(alpha.x + 3, alpha.y + alpha.height / 2); await page.mouse.down();
  await page.mouse.move(alpha.x + alpha.width + 120, alpha.y + 60, { steps: 8 });
  await expect(page.locator(".visual-drag-preview")).toBeHidden();
  await page.mouse.up();
  await expect(code).toHaveText("[spoiler=P][spoiler=A]alpha[/spoiler][spoiler=B]beta[/spoiler][/spoiler]");
  const a = (await head("A").boundingBox())!, b = (await head("B").boundingBox())!;
  await page.mouse.move(a.x + 80, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 4, { steps: 8 });
  await expect(page.locator(".visual-drop-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(code).toHaveText("[spoiler=P][spoiler=A]alpha[/spoiler][spoiler=B]beta[/spoiler][/spoiler]");
});

test("clicking the empty area of a spoiler starts typing there", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=E][/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const body = (await page.locator(".spoiler-body").first().boundingBox())!;
  await page.mouse.click(body.x + body.width - 20, body.y + 6);
  await page.keyboard.type("hi");
  await page.keyboard.press("Enter");
  await expect(code).toHaveText("[spoiler=E]hi[/spoiler]");
});

test("renames a spoiler by double-clicking its header and tidies its blank lines", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=Old]\n\n\ntext\n\n[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  const summary = page.locator(".builder-spoiler > summary").first();
  await expect(summary).not.toContainText("▣");
  await summary.dblclick();
  const input = page.getByRole("textbox", { name: "Изменить заголовок спойлера" });
  await input.fill("New title");
  await input.press("Enter");
  await expect(code).toHaveText("[spoiler=New title]\n\n\ntext\n\n[/spoiler]".replace(/\n/g, ""));
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.locator(".builder-spoiler > summary").first().click();
  await page.getByRole("button", { name: "Убрать пустые строки" }).click();
  await expect(page.locator(".cm-line")).toHaveCount(1);
  await expect(code).toHaveText("[spoiler=New title]text[/spoiler]");
});

test("opens settings from the gear and applies them", async ({ page }) => {
  await page.getByRole("button", { name: "Настройки" }).click();
  const dialog = page.getByRole("dialog", { name: "Настройки" });
  await dialog.getByRole("button", { name: "Редактор кода" }).click();
  await dialog.getByRole("checkbox", { name: "Показывать номера строк" }).uncheck();
  await dialog.getByRole("button", { name: "ОК" }).click();
  await expect(page.locator(".cm-lineNumbers")).toBeHidden();
  await page.keyboard.press("Control+Alt+KeyS");
  await expect(page.getByRole("dialog", { name: "Настройки" })).toBeVisible();
  await page.getByRole("dialog", { name: "Настройки" }).getByRole("button", { name: "Сбросить по умолчанию" }).click();
  await page.getByRole("dialog", { name: "Настройки" }).getByRole("button", { name: "ОК" }).click();
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
});

test("refactoring removes blank lines between and inside spoilers", async ({ page }) => {
  const code = page.locator(".cm-content");
  await code.fill("[spoiler=A]\n\na\n\n[/spoiler]\n\n\n[spoiler=B]b[/spoiler]");
  await expect(page.locator(".builder-caption")).toContainText("Синхронизирован");
  await page.locator(".app-menu > summary", { hasText: "Рефакторинг" }).click();
  await page.getByRole("button", { name: "Убрать пустые строки в документе" }).click();
  await expect(code).toHaveText("[spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]");
});
