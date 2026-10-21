import type { DocumentState } from "../document/state";
import type { DocumentSession, WorkspaceSession } from "./session";

const KEY = "bbforge.workspace.v1";
const MAX_DOCUMENT = 32 * 1024 * 1024;
const MAX_SESSION = 128 * 1024 * 1024;

export interface PersistedWorkspaceV1 {
  version: 1;
  activeId: string;
  tabs: DocumentSession[];
}

function validDocument(value: unknown): value is DocumentState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DocumentState>;
  return typeof item.id === "string" && typeof item.text === "string" && item.text.length <= MAX_DOCUMENT
    && typeof item.revision === "number" && typeof item.savedRevision === "number"
    && (typeof item.path === "string" || item.path === null) && typeof item.bom === "boolean"
    && Array.isArray(item.endings) && item.endings.every((ending) => ending === "lf" || ending === "crlf")
    && item.endings.length === item.text.split("\n").length - 1;
}

export function serializeWorkspace(state: WorkspaceSession): string {
  for (const tab of state.tabs) if (tab.document.text.length > MAX_DOCUMENT) throw new Error("Документ превышает лимит восстановления 32 MiB");
  const payload = JSON.stringify({ version: 1, activeId: state.activeId, tabs: state.tabs } satisfies PersistedWorkspaceV1);
  if (new TextEncoder().encode(payload).length > MAX_SESSION) throw new Error("Сеанс превышает лимит восстановления 128 MiB");
  return payload;
}

export function restoreWorkspace(payload: string | null): WorkspaceSession | null {
  if (!payload || new TextEncoder().encode(payload).length > MAX_SESSION) return null;
  try {
    const value = JSON.parse(payload) as Partial<PersistedWorkspaceV1>;
    if (value.version !== 1 || typeof value.activeId !== "string" || !Array.isArray(value.tabs) || value.tabs.length === 0) return null;
    const tabs = value.tabs.filter((tab): tab is DocumentSession => Boolean(tab && validDocument(tab.document) && tab.ui && typeof tab.ui === "object"));
    if (tabs.length !== value.tabs.length || !tabs.some((tab) => tab.document.id === value.activeId)) return null;
    return { activeId: value.activeId, tabs };
  } catch { return null; }
}

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export function createWorkspaceStore(invoke: Invoke | null, fallbackStorage: Storage, delay = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: WorkspaceSession | undefined;
  const write = async () => {
    if (!latest) return;
    const payload = serializeWorkspace(latest);
    latest = undefined;
    if (invoke) await invoke("write_workspace_session", { payload });
    else fallbackStorage.setItem(KEY, payload);
  };
  return {
    async load(): Promise<WorkspaceSession | null> {
      const payload = invoke ? await invoke("read_workspace_session", {}) as string | null : fallbackStorage.getItem(KEY);
      return restoreWorkspace(payload);
    },
    schedule(state: WorkspaceSession) {
      latest = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void write(); }, delay);
    },
    async flush() {
      if (timer) { clearTimeout(timer); timer = undefined; }
      await write();
    },
  };
}
