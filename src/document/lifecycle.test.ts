import { describe, expect, it, vi } from "vitest";
import { completeSave, requestDocumentAction, savedSnapshotIsCurrent } from "./lifecycle";
import { decodeDocument, applyChanges } from "./state";

describe("document lifecycle", () => {
  it("continues immediately when the document is clean", async () => {
    const choose = vi.fn();
    expect(await requestDocumentAction(false, choose, vi.fn())).toBe(true);
    expect(choose).not.toHaveBeenCalled();
  });

  it.each([
    ["discard", true, 0],
    ["cancel", false, 0],
    ["save", true, 1],
  ] as const)("handles %s before a destructive document action", async (choice, expected, saves) => {
    const save = vi.fn(async () => true);
    expect(await requestDocumentAction(true, async () => choice, save)).toBe(expected);
    expect(save).toHaveBeenCalledTimes(saves);
  });

  it("does not continue when saving fails or Save As is cancelled", async () => {
    expect(await requestDocumentAction(true, async () => "save", async () => false)).toBe(false);
  });

  it("keeps edits made during an older save dirty", () => {
    const initial = decodeDocument(new TextEncoder().encode("one"));
    const saving = applyChanges(initial, [{ from: 3, to: 3, insert: " two" }]);
    const edited = applyChanges(saving, [{ from: 7, to: 7, insert: " three" }]);

    const completed = completeSave(edited, saving.id, saving.revision, "/tmp/post.bbcode");

    expect(completed.savedRevision).toBe(1);
    expect(completed.revision).toBe(2);
    expect(completed.revision).not.toBe(completed.savedRevision);
  });

  it("ignores completion from a different document", () => {
    const first = decodeDocument(new TextEncoder().encode("first"), "/tmp/first.bbcode");
    const second = decodeDocument(new TextEncoder().encode("second"));

    expect(completeSave(second, first.id, first.revision, "/tmp/first.bbcode")).toBe(second);
  });

  it("does not authorize replacement after a newer edit", () => {
    const saving = decodeDocument(new TextEncoder().encode("first"));
    const edited = applyChanges(saving, [{ from: 5, to: 5, insert: " second" }]);

    expect(savedSnapshotIsCurrent(edited, saving.id, saving.revision)).toBe(false);
  });
});
