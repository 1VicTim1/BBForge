import { expect, it } from "vitest";
import { copyNode, copyVisualRange, createSpoiler, placeNodeAt, tidyBlankLines, tidyDocumentBlankLines, extractNode, moveNode, moveVisualRange, nestedSpoilerRange, renameSpoiler, unwrapNode } from "./structure";
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

it("creates a child at the end of a selected spoiler instead of wrapping its parent", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler=Parent]text[/spoiler]"));
  const snapshot = snapshotFixture(document);
  const selected = refFor(snapshot, 0);
  const range = nestedSpoilerRange(document, snapshot, { from: 0, to: document.text.length }, selected);
  expect(applyChanges(document, createSpoiler(document, range, "Child", snapshot).changes).text)
    .toBe("[spoiler=Parent]text[spoiler=Child][/spoiler][/spoiler]");
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

it("moves part of formatted text with its effective wrappers", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]very long[/b] plain"));
  const from = document.text.indexOf("long"), to = from + 4;
  const command = moveVisualRange(document, snapshotFixture(document), { from, to }, document.text.length);
  expect(applyChanges(document, command.changes).text).toBe("[b]very [/b] plain[b]long[/b]");
});

it("balances both sides when a visual selection crosses formatting", () => {
  const document = decodeDocument(new TextEncoder().encode("[b]foo[/b] x [i]bar[/i]"));
  const from = document.text.indexOf("oo"), to = document.text.indexOf("r[/i]");
  const command = moveVisualRange(document, snapshotFixture(document), { from, to }, document.text.length);
  expect(applyChanges(document, command.changes).text).toBe("[b]f[/b][i]r[/i][b]oo[/b] x [i]ba[/i]");
});

it("copies a formatted visual range without changing its source", () => {
  const document = decodeDocument(new TextEncoder().encode("[color=red]abc[/color] "));
  const content = document.text.indexOf("abc");
  const range = { from: content + 1, to: content + 3 };
  const command = copyVisualRange(document, snapshotFixture(document), range, document.text.length);
  expect(applyChanges(document, command.changes).text).toBe("[color=red]abc[/color] [color=red]bc[/color]");
});

it("copies a block inside a spoiler, including into itself, without removing the source", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]"));
  const snapshot = snapshotFixture(document);
  expect(applyChanges(document, copyNode(document, snapshot, refFor(snapshot, 0), { node: refFor(snapshot, 1), placement: "inside" }).changes).text)
    .toBe("[spoiler=A]a[/spoiler][spoiler=B]b[spoiler=A]a[/spoiler][/spoiler]");
  expect(applyChanges(document, copyNode(document, snapshot, refFor(snapshot, 0), { node: refFor(snapshot, 0), placement: "after" }).changes).text)
    .toBe("[spoiler=A]a[/spoiler][spoiler=A]a[/spoiler][spoiler=B]b[/spoiler]");
});

it("places a block at an exact position between siblings, outside its parent or inside text", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler=P][spoiler=A]a[/spoiler][spoiler=B]b[/spoiler][spoiler=C]c[/spoiler][/spoiler]text"));
  const snapshot = snapshotFixture(document);
  const parent = snapshot.analysis.nodes[0];
  const c = { documentId: document.id, revision: 0, span: parent.children[2].span };
  const apply = (at: number, copy = false) => applyChanges(document, placeNodeAt(document, snapshot, c, at, copy)!.changes).text;
  expect(apply(document.text.indexOf("[spoiler=B]"))).toBe("[spoiler=P][spoiler=A]a[/spoiler][spoiler=C]c[/spoiler][spoiler=B]b[/spoiler][/spoiler]text");
  expect(apply(0)).toBe("[spoiler=C]c[/spoiler][spoiler=P][spoiler=A]a[/spoiler][spoiler=B]b[/spoiler][/spoiler]text");
  expect(apply(document.text.length - 2)).toBe("[spoiler=P][spoiler=A]a[/spoiler][spoiler=B]b[/spoiler][/spoiler]te[spoiler=C]c[/spoiler]xt");
  expect(placeNodeAt(document, snapshot, c, document.text.indexOf("[spoiler=C]"), false)).toBeNull();
  expect(() => placeNodeAt(document, snapshot, c, 3, false)).toThrow();
});

it("tidies blank lines inside a spoiler without touching nested blocks", () => {
  const document = decodeDocument(new TextEncoder().encode("[spoiler=S]\n\n\n[quote]a\n\n\n[/quote]\n\n\n\ntext\n\n[/spoiler]"));
  const snapshot = snapshotFixture(document);
  const command = tidyBlankLines(document, snapshot, refFor(snapshot, 0))!;
  expect(applyChanges(document, command.changes).text).toBe("[spoiler=S][quote]a\n\n\n[/quote]\n\ntext[/spoiler]");
  expect(tidyBlankLines(applyChanges(document, command.changes), snapshotFixture(applyChanges(document, command.changes)), refFor(snapshotFixture(applyChanges(document, command.changes)), 0))).toBeNull();
});

it("removes blank lines between spoilers across the whole document", () => {
  const document = decodeDocument(new TextEncoder().encode("intro\n\n\n\nmore\n[spoiler=A]\na\n[/spoiler]\n\n\n[spoiler=B]\n\n[spoiler=C]c[/spoiler]\n\n[spoiler=D]d[/spoiler]\n[/spoiler]\n"));
  const command = tidyDocumentBlankLines(document, snapshotFixture(document))!;
  expect(applyChanges(document, command.changes).text).toBe("intro\n\nmore\n[spoiler=A]a[/spoiler][spoiler=B][spoiler=C]c[/spoiler][spoiler=D]d[/spoiler][/spoiler]\n");
});
