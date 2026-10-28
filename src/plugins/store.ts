import type { ScriptBackend } from "./scripts";
import type { CatalogEntry, CatalogResult, InstallPreview, InstalledPackage, ListedPackage } from "./types";

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
  /** Packages of the catalog repositories. */
  catalog(): Promise<CatalogResult>;
  /** Downloads a catalog package (checksum verified) and returns its local path. */
  download(entry: CatalogEntry): Promise<string>;
  /** Progress of catalog downloads; returns the unsubscribe function. */
  onDownloadProgress(listener: (progress: { id: string; downloaded: number; total: number | null }) => void): () => void;
  /** Downloads the signed list of trusted developers; their names, or null when it cannot. */
  refreshKeyring(): Promise<{ serial: number; developers: string[] } | null>;
  /** What plugin scripts may ask the desktop side for; null in the browser build. */
  scriptBackend: ScriptBackend | null;
}

declare global {
  interface Window {
    /** Browser tests inject packages here instead of installing them. */
    __BBFORGE_PLUGINS__?: InstalledPackage[];
  }
}

type Listen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
export function createPluginStore(invoke: Invoke | null, listen: Listen | null = null): PluginStore {
  if (!invoke) {
    const unavailable = async (): Promise<never> => { throw new Error("Плагины устанавливаются в настольном приложении"); };
    return {
      available: false,
      list: async () => (window.__BBFORGE_PLUGINS__ ?? []).map((item) => ({ status: "ok" as const, ...item })),
      preview: unavailable, install: unavailable, remove: unavailable, setEnabled: unavailable, acceptChanges: unavailable, catalog: unavailable, download: unavailable,
      onDownloadProgress: () => () => undefined,
      scriptBackend: null,
      refreshKeyring: async () => null,
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
    catalog: async () => await invoke("catalog_list") as CatalogResult,
    download: async (entry) => await invoke("catalog_download", { entry }) as string,
    refreshKeyring: async () => await invoke("keyring_refresh") as { serial: number; developers: string[] },
    scriptBackend: {
      httpGet: async (plugin, url, cookies) => await invoke("script_http_get", { plugin, url, cookies: cookies ?? null }) as { status: number; contentType: string; body: string },
      httpPost: async (plugin, url, body) => await invoke("script_http_post", { plugin, url, body }) as { status: number; contentType: string; body: string },
      origins: async (plugin) => await invoke("script_origins", { plugin }) as string[],
      setOrigin: async (plugin, origin, allowed) => { await invoke("script_origin_set", { plugin, origin, allowed }); },
      windowOpen: async (plugin, url, title) => await invoke("script_window_open", { plugin, url, title: title ?? null }) as string,
      windowCookies: async (plugin, label, names, ignore, timeoutMs) => await invoke("script_window_cookies", { plugin, label, names, ignore: ignore ?? null, timeoutMs: timeoutMs ?? null }) as Record<string, string>,
      windowClose: async (plugin, label) => { await invoke("script_window_close", { plugin, label }); },
      windowClearData: async (plugin) => { await invoke("script_window_clear_data", { plugin }); },
      storageGet: async (plugin, key) => await invoke("script_storage_get", { plugin, key }),
      storageSet: async (plugin, key, value) => { await invoke("script_storage_set", { plugin, key, value }); },
    },
    onDownloadProgress: (listener) => {
      if (!listen) return () => undefined;
      let stop: (() => void) | null = null, stopped = false;
      void listen("catalog-download", (event) => listener(event.payload as { id: string; downloaded: number; total: number | null })).then((unlisten) => { if (stopped) unlisten(); else stop = unlisten; });
      return () => { stopped = true; stop?.(); };
    },
  };
}
