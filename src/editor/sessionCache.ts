import type { EditorState } from "@codemirror/state";

export class EditorSessionCache {
  private readonly states = new Map<string, EditorState>();
  private readonly viewports = new Map<string, { top: number; left: number }>();

  save(documentId: string, state: EditorState): void {
    this.states.set(documentId, state);
  }

  restore(documentId: string): EditorState | undefined {
    return this.states.get(documentId);
  }

  saveViewport(documentId: string, viewport: { top: number; left: number }): void { this.viewports.set(documentId, viewport); }
  restoreViewport(documentId: string): { top: number; left: number } | undefined { return this.viewports.get(documentId); }

  delete(documentId: string): void {
    this.states.delete(documentId);
    this.viewports.delete(documentId);
  }
}
