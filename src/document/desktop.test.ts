import { describe, expect, it, vi } from "vitest";
import { createDesktopFiles } from "./desktop";

describe("desktop file adapter", () => {
  it("returns null when the open dialog is cancelled", async () => {
    const files = createDesktopFiles(vi.fn(), async () => null, vi.fn());
    expect(await files.openDocument()).toBeNull();
  });

  it("reads bytes from the selected path", async () => {
    const fingerprint = { modifiedMs: 1, size: 4, digest: "hash" };
    const invoke = vi.fn(async () => ({ bytes: [239, 187, 191, 97], canonicalPath: "/real/post.bbcode", fingerprint }));
    const files = createDesktopFiles(invoke, async () => "/tmp/post.bbcode", vi.fn());
    const opened = await files.openDocument();

    expect(invoke).toHaveBeenCalledWith("read_document", { path: "/tmp/post.bbcode" });
    expect(opened).toEqual({ path: "/real/post.bbcode", bytes: new Uint8Array([239, 187, 191, 97]), fingerprint });
  });

  it("asks for a path on Save As and writes the exact bytes", async () => {
    const fingerprint = { modifiedMs: 2, size: 3, digest: "new" };
    const invoke = vi.fn(async () => ({ canonicalPath: "/tmp/new.bbcode", fingerprint }));
    const files = createDesktopFiles(invoke, vi.fn(), async () => "/tmp/new.bbcode");
    const saved = await files.saveDocument(null, new Uint8Array([97, 13, 10]));

    expect(saved).toEqual({ path: "/tmp/new.bbcode", fingerprint });
    expect(invoke).toHaveBeenCalledWith("write_document", { path: "/tmp/new.bbcode", bytes: [97, 13, 10], expectedFingerprint: null });
  });

  it("passes the expected fingerprint and reports a typed conflict", async () => {
    const expected = { modifiedMs: 1, size: 3, digest: "old" };
    const files = createDesktopFiles(vi.fn(async () => { throw "FILE_CONFLICT"; }), vi.fn(), vi.fn());
    await expect(files.saveDocument("/tmp/post.bbcode", new Uint8Array([1]), expected)).rejects.toMatchObject({ name: "Error", path: "/tmp/post.bbcode" });
  });
});
