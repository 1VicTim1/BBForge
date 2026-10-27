import { describe, expect, it } from "vitest";
import { buildHost } from "./host";
import { normalizePatches, resolveSlot, type OwnedPatch } from "./ui";
import type { InstalledPackage, Manifest } from "./types";

const pkg = (manifest: Partial<Manifest> & { id: string }, files: Record<string, string> = {}, extra: Partial<InstalledPackage> = {}): InstalledPackage => ({
  manifest: { manifestVersion: 1, type: "plugin", name: manifest.id, version: "1.0.0", permissions: [], dependencies: {}, contributes: {}, ...manifest },
  enabled: true, signature: { state: "unsigned" }, tampered: false, errors: [], files, assets: {}, ...extra,
});

const selector = pkg({
  id: "victim.profile-selector", permissions: ["ui.add", "ui.slots", "profiles.select"],
  contributes: {
    slots: [{ id: "victim.profile-selector.options", title: "Пункты селектора профилей" }],
    ui: [{ op: "add", slot: "statusbar.right", before: "status.profile", item: { id: "victim.profile-selector.select", kind: "select", bind: "profile", source: "profiles", itemsSlot: "victim.profile-selector.options", title: "Профиль форума" } }],
  },
});
const styling = pkg({ id: "victim.selector-style", permissions: ["styles", "ui.modify"], dependencies: { "victim.profile-selector": "^1" },
  contributes: { styles: ["selector.css"], ui: [{ op: "update", target: "victim.profile-selector.select", set: { className: "fancy", title: "Форум" } }] } },
{ "selector.css": "[data-ui-id='victim.profile-selector.select'] { outline: 1px solid gold; }" });
const forums = pkg({ id: "victim.forums", permissions: ["profiles", "ui.add"], dependencies: { "victim.profile-selector": "^1" },
  contributes: { profiles: ["xen.json"], ui: [{ op: "add", slot: "victim.profile-selector.options", item: { id: "victim.forums.xen", kind: "option", title: "XenForo", value: "xenforo" } }] } },
{ "xen.json": JSON.stringify({ id: "xenforo", name: "XenForo", extends: "4pda", tags: [{ name: "hide", as: "spoiler" }] }) });

describe("plugin host", () => {
  it("lets one plugin add a selector, another restyle it and a third fill it", () => {
    const host = buildHost([forums, styling, selector]);
    expect(host.packages.every((item) => item.active && item.warnings.length === 0)).toBe(true);
    expect(host.slots.map((slot) => slot.id)).toEqual(["victim.profile-selector.options"]);
    expect(host.profiles.map((item) => item.profile.id)).toEqual(["xenforo"]);
    expect(host.styles[0].css).toContain("gold");

    const status = resolveSlot("statusbar.right", [{ id: "status.position", value: 1 }, { id: "status.profile", value: 2 }], host.patches);
    expect(status.map((entry) => entry.id)).toEqual(["status.position", "victim.profile-selector.select", "status.profile"]);
    expect(status[1]).toMatchObject({ title: "Форум", className: "fancy", owner: "victim.profile-selector" });
    expect(resolveSlot("victim.profile-selector.options", [], host.patches).map((entry) => entry.item?.value)).toEqual(["xenforo"]);
  });

  it("skips contributions the manifest does not permit", () => {
    const greedy = pkg({ id: "evil.plugin", permissions: ["ui.add"], contributes: {
      styles: ["x.css"], profiles: [{ id: "p", tags: [] }],
      ui: [{ op: "remove", target: "format.bold" }, { op: "add", slot: "toolbar.format", item: { id: "other.button", kind: "button", title: "x" } }, { op: "add", slot: "toolbar.format", item: { id: "evil.plugin.pick", kind: "select", bind: "theme", source: "themes" } }],
      commands: [{ id: "evil.plugin.write", title: "Write", run: { insert: "x" } }],
    } }, { "x.css": "* { display: none }" });
    const host = buildHost([greedy]);
    expect(host.styles).toEqual([]);
    expect(host.profiles).toEqual([]);
    expect(host.patches).toEqual([]);
    expect(host.commands).toEqual([]);
    expect(host.packages[0].warnings.join("\n")).toMatch(/«styles».*\n.*«profiles»|«profiles»[\s\S]*«styles»/);
    expect(host.packages[0].warnings.join("\n")).toContain("«ui.remove»");
    expect(host.packages[0].warnings.join("\n")).toContain("должен начинаться с «evil.plugin.»");
    expect(host.packages[0].warnings.join("\n")).toContain("«themes.select»");
  });

  it("does not load disabled or changed packages, nor packages whose dependencies are unmet", () => {
    const host = buildHost([
      pkg({ id: "a.off", contributes: {} }, {}, { enabled: false }), pkg({ id: "a.changed" }, {}, { tampered: true }),
      pkg({ id: "a.lonely", dependencies: { "a.missing": "^1" } }),
      pkg({ id: "a.base", version: "2.1.0" }), pkg({ id: "a.old-user", dependencies: { "a.base": "^1.0.0" } }), pkg({ id: "a.user", dependencies: { "a.base": "^2.0" } }),
      pkg({ id: "a.chain", dependencies: { "a.lonely": "*" } }), pkg({ id: "a.needs-off", dependencies: { "a.off": "*" } }),
    ]);
    const state = (id: string) => host.packages.find((item) => item.id === id)!;
    expect(host.packages.filter((item) => item.active).map((item) => item.id).sort()).toEqual(["a.base", "a.user"]);
    expect(state("a.lonely").dependencyIssues).toEqual([{ id: "a.missing", requirement: "^1", state: "missing" }]);
    expect(state("a.old-user").dependencyIssues).toEqual([{ id: "a.base", requirement: "^1.0.0", state: "version", installed: "2.1.0", name: "a.base" }]);
    expect(state("a.chain").dependencyIssues[0]).toMatchObject({ id: "a.lonely", state: "inactive" });
    expect(state("a.needs-off").dependencyIssues[0]).toMatchObject({ id: "a.off", state: "disabled" });
  });

  it("validates commands and the permissions their actions need", () => {
    const host = buildHost([pkg({ id: "a.snippets", permissions: ["commands", "document.edit"], contributes: { commands: [
      { id: "a.snippets.hr", title: "Разделитель", keys: ["Ctrl+Alt+KeyH", "bad key"], run: { insert: "[hr]" } },
      { id: "a.snippets.theme", title: "Тема", run: { setTheme: "night" } },
    ] } })]);
    expect(host.commands.map((command) => [command.id, command.keys])).toEqual([["a.snippets.hr", ["Ctrl+Alt+KeyH"]]]);
    expect(host.packages[0].warnings[0]).toContain("themes.select");
  });
});

describe("slots", () => {
  const owner = "p.x";
  const base = [{ id: "a", value: "A" }, { id: "b", value: "B" }, { id: "c", value: "C" }];
  it("moves, hides, renames and adds items", () => {
    const patches: OwnedPatch[] = [
      { op: "move", target: "c", before: "a", owner }, { op: "update", target: "b", set: { hidden: true }, owner },
      { op: "update", target: "a", set: { title: "Первый", icon: "star" }, owner }, { op: "add", slot: "s", item: { id: "p.x.new", kind: "separator" }, after: "c", owner },
    ];
    const entries = resolveSlot("s", base, patches);
    expect(entries.map((entry) => entry.id)).toEqual(["c", "p.x.new", "a"]);
    expect(entries[2]).toMatchObject({ title: "Первый", icon: "star", builtin: "A" });
  });
  it("turns a cross-slot move of a command into a command item", () => {
    const patches = normalizePatches([{ op: "move", target: "b", slot: "other", owner }, { op: "move", target: "c", slot: "other", owner }], () => "s", new Set(["b"]));
    expect(resolveSlot("s", base, patches).map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(resolveSlot("other", [], patches).map((entry) => entry.item)).toEqual([{ id: "b", kind: "command", command: "b" }]);
  });
});
