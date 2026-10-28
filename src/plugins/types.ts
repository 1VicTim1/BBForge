import permissions from "../../crates/bbforge-plugin/permissions.json";

/** Types of the desktop plugin store (src-tauri/src/plugins.rs) and the package manifest. */

/**
 * `scheme://host[:port]` of an address the user may allow a plugin to reach ("network.custom"):
 * https anywhere, http only on this computer or the local network (as in script_api.rs).
 */
export function originOf(url: string): string | null {
  const match = /^(https?):\/\/([^/?#@]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!match) return null;
  const scheme = match[1].toLowerCase(), authority = match[2].toLowerCase();
  const parts = /^(\[[0-9a-f:]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!parts) return null;
  const [, host, port] = parts;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535 || String(Number(port)) !== port)) return null;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)?.slice(1).map(Number);
  if (ipv4 && ipv4.some((part) => part > 255)) return null;
  const local = host === "localhost" || host === "[::1]" || (!!ipv4 && (ipv4[0] === 127 || ipv4[0] === 10 || (ipv4[0] === 192 && ipv4[1] === 168) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)));
  const named = host === "localhost" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
  if (!(named || ipv4 || host === "[::1]") || (scheme === "http" && !local)) return null;
  return `${scheme}://${host}${port ? `:${port}` : ""}`;
}

export interface PermissionInfo { id: string; title: string; description: string; risk: "low" | "medium" | "high" }
export const PERMISSIONS = permissions as PermissionInfo[];
const NETWORK = /^network:([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/;
/** Description of a permission; "network:<domain>" gets its domain filled in. */
export function permissionInfo(id: string): PermissionInfo | undefined {
  const host = NETWORK.exec(id)?.[1];
  const info = PERMISSIONS.find((item) => item.id === (host ? "network:*" : id));
  if (!info || (!host && info.id.endsWith("*"))) return undefined;
  return host ? { ...info, id, title: info.title.replace("{host}", host), description: info.description.replaceAll("{host}", host) } : info;
}
export const knownPermission = (id: string) => permissionInfo(id) !== undefined;
/** Domains of "network:<domain>" permissions. */
export const networkHosts = (permissions: string[]) => permissions.flatMap((id) => { const host = NETWORK.exec(id)?.[1]; return host ? [host] : []; });

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
  /** Script of the plugin (runs sandboxed with the "scripts" permission). */
  main?: string;
  /** Script functions packages depending on this one may call. */
  exports?: string[];
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
