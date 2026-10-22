// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { decodeDocument, updateDocumentText } from "../document/state";
import { createWorkspace } from "./session";
import { createWorkspaceStore, restoreWorkspace, serializeWorkspace } from "./persistence";

it("round-trips ordered tabs, active document and unsaved source", () => {
  const original = decodeDocument(new TextEncoder().encode("saved"), "/tmp/a.bbcode");
  const changed = updateDocumentText(original, "unsaved", []);
  const state = createWorkspace(changed);
  const restored = restoreWorkspace(serializeWorkspace(state));
  expect(restored?.activeId).toBe(changed.id);
  expect(restored?.tabs[0].document).toMatchObject({ text: "unsaved", revision: 1, savedRevision: 0, path: "/tmp/a.bbcode" });
});

it("rejects malformed, oversized and unknown workspace snapshots", () => {
  expect(restoreWorkspace("broken")).toBeNull();
  expect(restoreWorkspace(JSON.stringify({ version: 2, tabs: [] }))).toBeNull();
  const state = createWorkspace(decodeDocument(new TextEncoder().encode("x".repeat(32 * 1024 * 1024 + 1))));
  expect(() => serializeWorkspace(state)).toThrow(/32 MiB/);
});

it("merges incomplete restored UI with safe defaults", () => {
  const state = createWorkspace(decodeDocument(new TextEncoder().encode("text")));
  const raw = JSON.parse(serializeWorkspace(state)); raw.tabs[0].ui = {};
  expect(restoreWorkspace(JSON.stringify(raw))?.tabs[0].ui).toMatchObject({ codeSelection: { from: 0, to: 0 }, visualSelection: { from: 0, to: 0 }, activeSurface: "code", mode: "split", showPreview: false });
});

it("debounces writes and flushes the latest workspace", async () => {
  vi.useFakeTimers();
  const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => null);
  const store = createWorkspaceStore(invoke, localStorage, 100);
  const first = createWorkspace(decodeDocument(new TextEncoder().encode("one")));
  const second = createWorkspace(decodeDocument(new TextEncoder().encode("two")));
  store.schedule(first); store.schedule(second);
  await vi.advanceTimersByTimeAsync(100);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(String(invoke.mock.calls[0][1]?.payload)).toContain("two");
  store.schedule(first); await store.flush();
  expect(invoke).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
