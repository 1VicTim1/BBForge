import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { applyChanges, type DocumentState, type LineEnding } from "../document/state";
import { validateCommand, type EditCommand, type SourceRange } from "../document/commands";
import { lineEndingExtensions, setEditorEndings } from "./lineEndings";
export interface EditorController {
  execute(command: EditCommand): void; undo(): boolean; redo(): boolean;
  getSelection(): SourceRange; isComposing(): boolean; finishComposition(): Promise<void>;
  select(range: SourceRange, focus?: boolean): void;
}
export function createEditorState(document: DocumentState, extensions: Extension[], onChange: (text: string, endings: LineEnding[]) => void): EditorState {
  const endings = lineEndingExtensions(document);
  return EditorState.create({ doc: document.text, extensions: [history(), ...endings.extensions, ...extensions, EditorView.updateListener.of((update) => {
    if (update.docChanged) onChange(update.state.doc.toString(), update.state.field(endings.field));
  })] });
}
export function createEditorController(view: EditorView, getDocument: () => DocumentState): EditorController {
  return {
    execute(command) {
      const current = getDocument(); validateCommand(current, command);
      if (view.state.doc.toString() !== current.text) throw new Error("Редактор ещё не синхронизирован");
      const next = applyChanges(current, command.changes);
      view.dispatch({ changes: command.changes, effects: setEditorEndings.of(next.endings), selection: command.selection ? { anchor: command.selection.from, head: command.selection.to } : undefined, annotations: isolateHistory.of("full") });
    },
    undo: () => undo(view), redo: () => redo(view),
    getSelection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    select(range, focus = true) { view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true }); if (focus) view.focus(); },
    isComposing: () => view.composing,
    async finishComposition() {
      if (!view.composing) return; view.contentDOM.blur();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (view.composing) throw new Error("Завершите ввод текста перед файловым действием");
    },
  };
}
