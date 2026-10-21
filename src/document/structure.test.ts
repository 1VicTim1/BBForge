import { expect, it } from "vitest";
import { createSpoiler, extractNode, moveNode, renameSpoiler, unwrapNode } from "./structure";
import { applyChanges, decodeDocument, serializeDocument } from "./state";
import { snapshotFixture, refFor } from "../test/structureFixture";

it("wraps and renames without adding whitespace or losing title markup", () => {
  const document = decodeDocument(new TextEncoder().encode("hello"));
  expect(applyChanges(document, createSpoiler(document, { from: 0, to: 0 }, "X", snapshotFixture(document)).changes).text).toBe("[spoiler=X][/spoiler]hello");
  const wrapped = applyChanges(document, createSpoiler(document, { from: 0, to: 5 }, "[b]Важно[/b]", snapshotFixture(document)).changes);
  expect(wrapped.text).toBe("[spoiler=[b]Важно[/b]]hello[/spoiler]");
  const snapshot = snapshotFixture(wrapped);
  expect(applyChanges(wrapped, renameSpoiler(wrapped, snapshot, refFor(snapshot, 0), "Новое").changes).text).toBe("[spoiler=Новое]hello[/spoiler]");
});

it("extracts the last child preserving source bytes and mixed endings", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler=P]a\r\n[spoiler=C]😀\n[/spoiler][/spoiler]z\r\n"));
  const snapshot = snapshotFixture(document);
  const parent = snapshot.analysis.nodes[0];
  const child = parent.children.find((node) => node.name === "spoiler")!;
  const reference = { documentId: document.id, revision: 0, span: child.span };
  const result = applyChanges(document, extractNode(document, snapshot, reference).changes);
  expect(new TextDecoder().decode(serializeDocument(result))).toBe("[spoiler=P]a\r\n[/spoiler][spoiler=C]😀\n[/spoiler]z\r\n");
  expect(applyChanges(document, unwrapNode(document, snapshot, reference).changes).text).toBe("[spoiler=P]a\n😀\n[/spoiler]z\n");
  expect(() => moveNode(document, snapshot, refFor(snapshot, 0), { node: reference, placement: "inside" })).toThrow();
});

it("moves opaque blocks exactly and rejects stale refs", () => {
  const document = decodeDocument(new TextEncoder().encode("[alien=q]x[/alien][spoiler=S]y[/spoiler]"));
  const snapshot = snapshotFixture(document);
  expect(applyChanges(document, moveNode(document, snapshot, refFor(snapshot, 0), { node: refFor(snapshot, 1), placement: "after" }).changes).text).toBe("[spoiler=S]y[/spoiler][alien=q]x[/alien]");
  expect(() => unwrapNode({ ...document, revision: 2 }, snapshot, refFor(snapshot, 0))).toThrow();
});

it("rejects spoiler ranges cutting tags or literal code", () => {
  for (const [text, from, to] of [["[b]abc[/b]", 1, 5], ["[code]abc[/code]", 6, 9]] as const) {
    const document = decodeDocument(new TextEncoder().encode(text));
    expect(() => createSpoiler(document, { from, to }, "X", snapshotFixture(document))).toThrow();
  }
});
