import type { InstallPreview, InstalledPackage, ListedPackage } from "./types";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export interface PluginStore {
  /** False in the browser build: packages can only be shown, not installed. */
  available: boolean;
  list(): Promise<ListedPackage[]>;
  preview(path: string): Promise<InstallPreview>;
  install(path: string, digest: string): Promise<InstalledPackage>;
  remove(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  acceptChanges(id: string): Promise<void>;
}

declare global {
  interface Window {
    /** Browser tests inject packages here instead of installing them. */
    __BBFORGE_PLUGINS__?: InstalledPackage[];
  }
}

export function createPluginStore(invoke: Invoke | null): PluginStore {
  if (!invoke) {
    const unavailable = async (): Promise<never> => { throw new Error("Плагины устанавливаются в настольном приложении"); };
    return {
      available: false,
      list: async () => (window.__BBFORGE_PLUGINS__ ?? []).map((item) => ({ status: "ok" as const, ...item })),
      preview: unavailable, install: unavailable, remove: unavailable, setEnabled: unavailable, acceptChanges: unavailable,
    };
  }
  return {
    available: true,
    list: async () => await invoke("plugin_list") as ListedPackage[],
    preview: async (path) => await invoke("plugin_preview", { path }) as InstallPreview,
    install: async (path, digest) => await invoke("plugin_install", { path, digest }) as InstalledPackage,
    remove: async (id) => { await invoke("plugin_remove", { id }); },
    setEnabled: async (id, enabled) => { await invoke("plugin_set_enabled", { id, enabled }); },
    acceptChanges: async (id) => { await invoke("plugin_accept_changes", { id }); },
  };
}
