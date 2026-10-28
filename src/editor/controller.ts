import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyChanges, type DocumentState, type LineEnding } from "../document/state";
import { validateCommand, type EditCommand, type SourceRange } from "../document/commands";
import { lineEndingExtensions, setEditorEndings } from "./lineEndings";
import { EditorSessionCache } from "./sessionCache";
export interface EditorController {
  readonly view: EditorView;
  execute(command: EditCommand): void; undo(): boolean; redo(): boolean;
  getSelection(): SourceRange; isComposing(): boolean; finishComposition(): Promise<void>;
  select(range: SourceRange, focus?: boolean): void;
  positionAt(x: number, y: number): number | null;
  activate(documentId: string, document: DocumentState, viewport?: { top: number; left: number }): boolean;
  discard(documentId: string): void;
}
/**
 * Undo goes word by word, like in word processors: typing a new word after a space or a line
 * break starts a new step, instead of everything typed without a pause being one step.
 */
export const wordUndoSteps = EditorState.transactionExtender.of((transaction) => {
  if (!transaction.isUserEvent("input.type") || !transaction.docChanged) return null;
  let inserted = "", at = -1;
  transaction.changes.iterChanges((from, _to, _fromB, _toB, text) => { if (at < 0) { at = from; inserted = text.toString(); } });
  const before = at > 0 ? transaction.startState.doc.sliceString(at - 1, at) : "";
  const wordStarts = /^\S/.test(inserted) && /\s/.test(before);
  return wordStarts || inserted.includes("\n") ? { annotations: isolateHistory.of("before") } : null;
});
export function createEditorState(document: DocumentState, extensions: Extension[], onChange: (text: string, endings: LineEnding[]) => void, selection?: SourceRange): EditorState {
  const endings = lineEndingExtensions(document);
  const from = Math.min(document.text.length, Math.max(0, selection?.from ?? 0)), to = Math.min(document.text.length, Math.max(0, selection?.to ?? from));
  return EditorState.create({ doc: document.text, selection: { anchor: from, head: to }, extensions: [history(), wordUndoSteps, ...endings.extensions, ...extensions, EditorView.updateListener.of((update) => {
    if (update.docChanged) onChange(update.state.doc.toString(), update.state.field(endings.field));
  })] });
}
export function createEditorController(view: EditorView, getDocument: (documentId?: string) => DocumentState, createState?: (document: DocumentState) => EditorState, getComposing: () => boolean = () => false): EditorController {
  const cache = new EditorSessionCache();
  let activeId = getDocument().id;
  return {
    view,
    execute(command) {
      const current = getDocument(); validateCommand(current, command);
      if (view.state.doc.toString() !== current.text) throw new Error("Редактор ещё не синхронизирован");
      const next = applyChanges(current, command.changes);
      view.dispatch({ changes: command.changes, effects: setEditorEndings.of(next.endings), selection: command.selection ? { anchor: command.selection.from, head: command.selection.to } : undefined, annotations: isolateHistory.of("full") });
    },
    undo: () => undo(view), redo: () => redo(view),
    getSelection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    select(range, focus = true) { view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true }); if (focus) view.focus(); },
    positionAt: (x, y) => view.posAtCoords({ x, y }),
    isComposing: () => view.composing || getComposing(),
    async finishComposition() {
      if (!view.composing) return; view.contentDOM.blur();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (view.composing) throw new Error("Завершите ввод текста перед файловым действием");
    },
    activate(documentId, document, viewport) {
      if (documentId === activeId) {
        if (viewport) requestAnimationFrame(() => requestAnimationFrame(() => { view.scrollDOM.scrollLeft = viewport.left; view.scrollDOM.scrollTop = viewport.top; }));
        return true;
      }
      if (view.composing || getComposing()) return false;
      cache.save(activeId, view.state);
      cache.saveViewport(activeId, { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft });
      const state = cache.restore(documentId) ?? createState?.(document);
      if (!state) throw new Error("Редактор не умеет создать состояние документа");
      activeId = documentId;
      view.setState(state);
      const target = cache.restoreViewport(documentId) ?? viewport;
      if (target) requestAnimationFrame(() => requestAnimationFrame(() => { view.scrollDOM.scrollLeft = target.left; view.scrollDOM.scrollTop = target.top; }));
      return true;
    },
    discard(documentId) {
      cache.delete(documentId);
    },
  };
}
