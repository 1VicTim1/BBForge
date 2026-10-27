import { satisfies, tooNew } from "./semver";
import type { CatalogEntry, InstalledPackage, Manifest } from "./types";

/**
 * What installing a package means for dependencies: which ones are already there, which are
 * missing, off, too old or too new, and which installed packages stop working with the new version.
 */
export interface DependencyItem {
  id: string;
  /** The package's name when it is installed or in the catalog. */
  name?: string;
  requirement: string;
  installed?: string;
  /** A catalog version that meets the requirement, if any. */
  available?: string;
}
export interface DependencyPlan {
  ready: DependencyItem[];
  missing: DependencyItem[];
  disabled: DependencyItem[];
  update: DependencyItem[];
  downgrade: DependencyItem[];
  /** Installed packages whose requirement on this package the new version does not meet. */
  breaks: DependencyItem[];
}
export const planIsEmpty = (plan: DependencyPlan) => Object.values(plan).every((group) => group.length === 0);
/** Whether the package will load right after installation. */
export const planBlocks = (plan: DependencyPlan) => plan.missing.length + plan.disabled.length + plan.update.length + plan.downgrade.length > 0;

export function planDependencies(manifest: Manifest, installed: InstalledPackage[], catalog: CatalogEntry[] = []): DependencyPlan {
  const plan: DependencyPlan = { ready: [], missing: [], disabled: [], update: [], downgrade: [], breaks: [] };
  const byId = new Map(installed.map((item) => [item.manifest.id, item]));
  for (const [id, requirement] of Object.entries(manifest.dependencies ?? {})) {
    const target = byId.get(id), offered = catalog.find((entry) => entry.id === id && satisfies(entry.version, requirement));
    const item: DependencyItem = { id, requirement, name: target?.manifest.name ?? offered?.name, installed: target?.manifest.version, available: offered?.version };
    if (!target) plan.missing.push(item);
    else if (!satisfies(target.manifest.version, requirement)) (tooNew(target.manifest.version, requirement) ? plan.downgrade : plan.update).push(item);
    else if (!target.enabled) plan.disabled.push(item);
    else plan.ready.push(item);
  }
  for (const other of installed) {
    if (other.manifest.id === manifest.id) continue;
    const requirement = other.manifest.dependencies?.[manifest.id];
    if (requirement && !satisfies(manifest.version, requirement)) plan.breaks.push({ id: other.manifest.id, name: other.manifest.name, requirement, installed: other.manifest.version });
  }
  return plan;
}
