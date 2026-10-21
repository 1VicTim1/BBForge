import type { EditorState } from "@codemirror/state";

export class EditorSessionCache {
  private readonly states = new Map<string, EditorState>();

  save(documentId: string, state: EditorState): void {
    this.states.set(documentId, state);
  }

  restore(documentId: string): EditorState | undefined {
    return this.states.get(documentId);
  }

  delete(documentId: string): void {
    this.states.delete(documentId);
  }
}
