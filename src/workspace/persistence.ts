import type { DocumentState } from "../document/state";
import { createDocumentSession, type DiskFingerprint, type DocumentSession, type DocumentUiState, type WorkspaceSession } from "./session";

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
    const tabs: DocumentSession[] = [];
    for (const raw of value.tabs) {
      if (!raw || !validDocument(raw.document)) return null;
      const defaults = createDocumentSession(raw.document), candidate = raw.ui as Partial<DocumentUiState> | undefined;
      const range = (input: unknown) => input && typeof input === "object" && typeof (input as { from?: unknown }).from === "number" && typeof (input as { to?: unknown }).to === "number" ? input as { from: number; to: number } : null;
      const scroll = (input: unknown) => input && typeof input === "object" && typeof (input as { top?: unknown }).top === "number" && typeof (input as { left?: unknown }).left === "number" ? input as { top: number; left: number } : null;
      const codeSelection = range(candidate?.codeSelection) ?? defaults.ui.codeSelection;
      const visualSelection = range(candidate?.visualSelection) ?? defaults.ui.visualSelection;
      const fingerprint = raw.diskFingerprint as DiskFingerprint | null | undefined;
      tabs.push({ document: raw.document, ui: { ...defaults.ui, codeSelection, visualSelection, codeScroll: scroll(candidate?.codeScroll) ?? defaults.ui.codeScroll, builderScroll: scroll(candidate?.builderScroll) ?? defaults.ui.builderScroll, previewScroll: scroll(candidate?.previewScroll) ?? defaults.ui.previewScroll, selected: candidate?.selected && typeof candidate.selected === "object" ? candidate.selected : null, mode: ["code", "builder", "split"].includes(candidate?.mode ?? "") ? candidate!.mode! : defaults.ui.mode, showPreview: typeof candidate?.showPreview === "boolean" ? candidate.showPreview : false, activeSurface: candidate?.activeSurface === "builder" ? "builder" : "code" }, diskFingerprint: fingerprint && typeof fingerprint.digest === "string" && typeof fingerprint.modifiedMs === "number" && typeof fingerprint.size === "number" ? fingerprint : null });
    }
    if (!tabs.some((tab) => tab.document.id === value.activeId)) return null;
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
