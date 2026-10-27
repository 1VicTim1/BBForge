import { describe, expect, it } from "vitest";
import { planBlocks, planDependencies, planIsEmpty } from "./dependencies";
import type { CatalogEntry, InstalledPackage, Manifest } from "./types";

const manifest = (id: string, version = "1.0.0", dependencies: Record<string, string> = {}): Manifest => ({ manifestVersion: 1, type: "plugin", id, name: `name ${id}`, version, permissions: [], dependencies, contributes: {} });
const installed = (id: string, version: string, enabled = true, dependencies: Record<string, string> = {}): InstalledPackage => ({ manifest: manifest(id, version, dependencies), enabled, signature: { state: "unsigned" }, tampered: false, errors: [], files: {}, assets: {} });
const offer = (id: string, version: string): CatalogEntry => ({ id, type: "plugin", name: `catalog ${id}`, version, permissions: [], file: "dist/x.zip", sha256: "0".repeat(64), size: 1, catalog: 0 });

describe("dependency plan", () => {
  it("sorts dependencies into ready, missing, disabled, update and downgrade", () => {
    const plan = planDependencies(manifest("a.new", "1.0.0", { "a.ok": "^1", "a.gone": "^2.0", "a.off": "*", "a.old": "^1.4", "a.newer": "~1.0.0" }),
      [installed("a.ok", "1.2.0"), installed("a.off", "0.1.0", false), installed("a.old", "1.3.0"), installed("a.newer", "1.5.0")], [offer("a.gone", "2.3.0"), offer("a.old", "1.4.2")]);
    expect(plan.ready.map((item) => item.id)).toEqual(["a.ok"]);
    expect(plan.missing).toEqual([{ id: "a.gone", requirement: "^2.0", name: "catalog a.gone", installed: undefined, available: "2.3.0" }]);
    expect(plan.disabled.map((item) => item.id)).toEqual(["a.off"]);
    expect(plan.update).toEqual([{ id: "a.old", requirement: "^1.4", name: "name a.old", installed: "1.3.0", available: "1.4.2" }]);
    expect(plan.downgrade.map((item) => item.id)).toEqual(["a.newer"]);
    expect(planBlocks(plan)).toBe(true);
  });
  it("lists installed packages the new version would break", () => {
    const plan = planDependencies(manifest("a.base", "2.0.0"), [installed("a.base", "1.0.0"), installed("a.user", "1.0.0", true, { "a.base": "^1.0.0" }), installed("a.fine", "1.0.0", true, { "a.base": ">=1" })]);
    expect(plan.breaks.map((item) => item.id)).toEqual(["a.user"]);
    expect(planBlocks(plan)).toBe(false);
  });
  it("is empty for a package without dependencies or dependents", () => {
    expect(planIsEmpty(planDependencies(manifest("a.solo"), [installed("a.other", "1.0.0")]))).toBe(true);
  });
});
