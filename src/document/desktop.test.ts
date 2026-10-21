import { describe, expect, it, vi } from "vitest";
import { createDesktopFiles } from "./desktop";

describe("desktop file adapter", () => {
  it("returns null when the open dialog is cancelled", async () => {
    const files = createDesktopFiles(vi.fn(), async () => null, vi.fn());
    expect(await files.openDocument()).toBeNull();
  });

  it("reads bytes from the selected path", async () => {
    const invoke = vi.fn(async () => [239, 187, 191, 97]);
    const files = createDesktopFiles(invoke, async () => "/tmp/post.bbcode", vi.fn());
    const opened = await files.openDocument();

    expect(invoke).toHaveBeenCalledWith("read_document", { path: "/tmp/post.bbcode" });
    expect(opened).toEqual({ path: "/tmp/post.bbcode", bytes: new Uint8Array([239, 187, 191, 97]) });
  });

  it("asks for a path on Save As and writes the exact bytes", async () => {
    const invoke = vi.fn(async () => undefined);
    const files = createDesktopFiles(invoke, vi.fn(), async () => "/tmp/new.bbcode");
    const path = await files.saveDocument(null, new Uint8Array([97, 13, 10]));

    expect(path).toBe("/tmp/new.bbcode");
    expect(invoke).toHaveBeenCalledWith("write_document", { path, bytes: [97, 13, 10] });
  });
});
