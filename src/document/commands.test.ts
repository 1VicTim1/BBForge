import { expect, it } from "vitest";
import { validateCommand } from "./commands";
import { decodeDocument } from "./state";

it("rejects stale identities, overlapping ranges and split emoji before any mutation", () => {
  const document = decodeDocument(new TextEncoder().encode("a😀b"));
  const base = { documentId: document.id, revision: 0, label: "edit", changes: [{ from: 1, to: 3, insert: "x" }] };
  expect(() => validateCommand(document, base)).not.toThrow();
  expect(() => validateCommand(document, { ...base, documentId: "other" })).toThrow();
  expect(() => validateCommand(document, { ...base, revision: 2 })).toThrow();
  expect(() => validateCommand(document, { ...base, changes: [{ from: 2, to: 3, insert: "" }] })).toThrow();
  expect(() => validateCommand(document, { ...base, changes: [...base.changes, { from: 1, to: 4, insert: "" }] })).toThrow();
  expect(document.text).toBe("a😀b");
});
