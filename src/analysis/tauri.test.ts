import { describe, expect, it, vi } from "vitest";
import { createTauriAnalyzer } from "./tauri";

describe("Tauri analysis adapter", () => {
  it("invokes analyze with the desktop command argument names", async () => {
    const invoke = vi.fn(async () => ({ documentId: "doc", revision: 3, analysis: { diagnostics: [] } }));
    const analyze = createTauriAnalyzer(invoke);

    const response = await analyze({ source: "[b]", documentId: "doc", revision: 3 });

    expect(invoke).toHaveBeenCalledWith("analyze", { source: "[b]", documentId: "doc", revision: 3 });
    expect(response.revision).toBe(3);
  });
});
