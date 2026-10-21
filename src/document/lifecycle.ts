import type { DocumentState } from "./state";

export type UnsavedChoice = "save" | "discard" | "cancel";

export async function requestDocumentAction(
  dirty: boolean,
  choose: () => Promise<UnsavedChoice>,
  save: () => Promise<boolean>,
): Promise<boolean> {
  if (!dirty) return true;
  const choice = await choose();
  if (choice === "cancel") return false;
  if (choice === "discard") return true;
  return save();
}

export async function requestWorkspaceClose(documentIds: string[], request: (documentId: string) => Promise<boolean>): Promise<boolean> {
  for (const documentId of documentIds) if (!await request(documentId)) return false;
  return true;
}

export function completeSave(document: DocumentState, savedDocumentId: string, savedRevision: number, path: string): DocumentState {
  if (document.id !== savedDocumentId) return document;
  return { ...document, path, savedRevision };
}

export function savedSnapshotIsCurrent(document: DocumentState, savedDocumentId: string, savedRevision: number): boolean {
  return document.id === savedDocumentId && document.revision === savedRevision;
}
