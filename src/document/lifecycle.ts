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

export function completeSave(document: DocumentState, savedRevision: number, path: string): DocumentState {
  return { ...document, path, savedRevision };
}
