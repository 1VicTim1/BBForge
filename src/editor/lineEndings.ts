import { invertedEffects } from "@codemirror/commands";
import { StateEffect, StateField } from "@codemirror/state";
import { applyChanges, type DocumentState, type LineEnding, type TextChange } from "../document/state";
export const setEditorEndings = StateEffect.define<LineEnding[]>();
export function lineEndingExtensions(initial: DocumentState) {
  const field = StateField.define<LineEnding[]>({
    create: () => [...initial.endings],
    update(current, transaction) {
      const effect = transaction.effects.find((item) => item.is(setEditorEndings));
      if (effect) return [...effect.value];
      if (!transaction.docChanged) return current;
      const changes: TextChange[] = [];
      transaction.changes.iterChanges((from, to, _a, _b, insert) => changes.push({ from, to, insert: insert.toString() }));
      return applyChanges({ ...initial, text: transaction.startState.doc.toString(), endings: current }, changes).endings;
    },
  });
  return { field, extensions: [field, invertedEffects.of((transaction) => transaction.docChanged ? [setEditorEndings.of(transaction.startState.field(field))] : [])] };
}
