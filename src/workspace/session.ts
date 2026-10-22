import type { SourceRange } from "../document/commands";
import type { DocumentState } from "../document/state";
import type { NodeRef } from "../document/structure";
import type { WorkspaceMode } from "../layout/settings";
import type { ActiveSurface } from "../commands/activeSelection";

export interface DiskFingerprint {
  modifiedMs: number;
  size: number;
  digest: string;
}

export interface DocumentUiState {
  codeSelection: SourceRange;
  visualSelection: SourceRange;
  codeScroll: ScrollPosition;
  builderScroll: ScrollPosition;
  previewScroll: ScrollPosition;
  selected: NodeRef | null;
  mode: WorkspaceMode;
  showPreview: boolean;
  activeSurface: ActiveSurface;
}
export interface ScrollPosition { top: number; left: number }

export interface DocumentSession {
  document: DocumentState;
  ui: DocumentUiState;
  diskFingerprint: DiskFingerprint | null;
}

export interface WorkspaceSession {
  tabs: DocumentSession[];
  activeId: string;
}

type OpenSession = Pick<DocumentSession, "document"> & Partial<Omit<DocumentSession, "document">>;
type WorkspaceAction =
  | { type: "restore"; workspace: WorkspaceSession }
  | { type: "open"; session: OpenSession; canonicalPath?: (path: string) => string }
  | { type: "activate"; documentId: string }
  | { type: "updateDocument"; documentId: string; document: DocumentState }
  | { type: "updateFingerprint"; documentId: string; fingerprint: DiskFingerprint | null }
  | { type: "updateUi"; documentId: string; ui: Partial<DocumentUiState> }
  | { type: "reorder"; documentId: string; to: number }
  | { type: "close"; documentId: string };

const emptyRange = (): SourceRange => ({ from: 0, to: 0 });

export function createDocumentSession(document: DocumentState): DocumentSession {
  return {
    document,
    ui: {
      codeSelection: emptyRange(),
      visualSelection: emptyRange(),
      codeScroll: { top: 0, left: 0 },
      builderScroll: { top: 0, left: 0 },
      previewScroll: { top: 0, left: 0 },
      selected: null,
      mode: "split",
      showPreview: false,
      activeSurface: "code",
    },
    diskFingerprint: null,
  };
}

export function createWorkspace(document: DocumentState): WorkspaceSession {
  return { tabs: [createDocumentSession(document)], activeId: document.id };
}

function completeSession(session: OpenSession): DocumentSession {
  const defaults = createDocumentSession(session.document);
  return {
    ...defaults,
    ...session,
    ui: { ...defaults.ui, ...session.ui },
  };
}

export function workspaceReducer(state: WorkspaceSession, action: WorkspaceAction): WorkspaceSession {
  switch (action.type) {
    case "restore":
      return action.workspace.tabs.length ? action.workspace : state;
    case "open": {
      const path = action.session.document.path;
      const existing = path === null ? undefined : state.tabs.find((tab) => {
        if (tab.document.path === null) return false;
        const canonical = action.canonicalPath ?? ((value: string) => value);
        return canonical(tab.document.path) === canonical(path);
      });
      if (existing) return { ...state, activeId: existing.document.id };
      const session = completeSession(action.session);
      return { tabs: [...state.tabs, session], activeId: session.document.id };
    }
    case "activate":
      return state.tabs.some((tab) => tab.document.id === action.documentId)
        ? { ...state, activeId: action.documentId }
        : state;
    case "updateDocument":
      return { ...state, tabs: state.tabs.map((tab) => tab.document.id === action.documentId ? { ...tab, document: action.document } : tab) };
    case "updateFingerprint":
      return { ...state, tabs: state.tabs.map((tab) => tab.document.id === action.documentId ? { ...tab, diskFingerprint: action.fingerprint } : tab) };
    case "updateUi":
      return { ...state, tabs: state.tabs.map((tab) => tab.document.id === action.documentId ? { ...tab, ui: { ...tab.ui, ...action.ui } } : tab) };
    case "reorder": {
      const from = state.tabs.findIndex((tab) => tab.document.id === action.documentId);
      if (from < 0) return state;
      const tabs = [...state.tabs];
      const [tab] = tabs.splice(from, 1);
      tabs.splice(Math.max(0, Math.min(action.to, tabs.length)), 0, tab);
      return { ...state, tabs };
    }
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.document.id === action.documentId);
      if (index < 0) return state;
      const tabs = state.tabs.filter((tab) => tab.document.id !== action.documentId);
      if (state.activeId !== action.documentId) return { ...state, tabs };
      return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)]?.document.id ?? "" };
    }
  }
}
