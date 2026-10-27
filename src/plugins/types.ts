import permissions from "../../crates/bbforge-plugin/permissions.json";

/** Types of the desktop plugin store (src-tauri/src/plugins.rs) and the package manifest. */

export interface PermissionInfo { id: string; title: string; description: string; risk: "low" | "medium" | "high" }
export const PERMISSIONS = permissions as PermissionInfo[];
export const permissionInfo = (id: string): PermissionInfo | undefined => PERMISSIONS.find((item) => item.id === id);

export type SignatureStatus =
  | { state: "unsigned" }
  | { state: "trusted"; signer: string; publicKey: string }
  | { state: "untrusted"; signer: string; publicKey: string }
  | { state: "invalid"; reason: string };

export interface Manifest {
  manifestVersion: number;
  type: "plugin" | "theme";
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  engine?: string;
  permissions: string[];
  dependencies: Record<string, string>;
  contributes: Record<string, unknown>;
}

export interface InstalledPackage {
  manifest: Manifest;
  enabled: boolean;
  signature: SignatureStatus;
  /** The archive changed on disk after installation; it is not loaded until accepted again. */
  tampered: boolean;
  errors: string[];
  /** Text files by path. */
  files: Record<string, string>;
  /** Images as data: URLs by path. */
  assets: Record<string, string>;
}
export type ListedPackage = ({ status: "ok" } & InstalledPackage) | { status: "broken"; id: string; error: string };

export interface InstallPreview {
  manifest: Manifest;
  signature: SignatureStatus;
  digest: string;
  files: string[];
  errors: string[];
  warnings: string[];
  installedVersion: string | null;
  needsConfirmation: boolean;
}

/** A package listed in a catalog repository (index.json made by `bbforge-pack index`). */
export interface CatalogEntry {
  id: string; type: "plugin" | "theme"; name: string; version: string;
  description?: string | null; author?: string | null; permissions: string[]; signer?: string | null;
  file: string; sha256: string; size: number; catalog: number;
}
export interface CatalogResult { packages: CatalogEntry[]; errors: string[] }

export { compareVersions } from "./semver";

export function signatureLabel(signature: SignatureStatus): string {
  if (signature.state === "trusted") return `Подписан: ${signature.signer}`;
  if (signature.state === "untrusted") return `Подпись неизвестного автора${signature.signer ? ` (${signature.signer})` : ""}`;
  if (signature.state === "invalid") return "Подпись недействительна";
  return "Без подписи";
}
