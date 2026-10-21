import type { SourceRange } from "../document/commands";
import type { DocumentSession } from "../workspace/session";

export type ActiveSurface = "code" | "builder";
export interface ActiveSelection extends SourceRange { documentId: string; revision: number; surface: ActiveSurface }

export function resolveActiveSelection(session: DocumentSession, controller: { getSelection(): SourceRange } | null): ActiveSelection {
  const surface = session.ui.activeSurface;
  const range = surface === "builder" ? session.ui.visualSelection : controller?.getSelection() ?? session.ui.codeSelection;
  return { ...range, documentId: session.document.id, revision: session.document.revision, surface };
}
