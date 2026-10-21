import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalysisClient, type AnalysisRequest, type AnalysisResponse } from "./client";

type TestAnalysis = { value?: string; diagnostics?: never[] };

afterEach(() => vi.useRealTimers());

describe("analysis client", () => {
  it("debounces input for 150 milliseconds", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn(async (request) => ({ ...request, analysis: { diagnostics: [] } }));
    const client = createAnalysisClient(analyze, () => undefined);

    client.update({ source: "[b]", documentId: "one", revision: 1 });
    await vi.advanceTimersByTimeAsync(149);
    expect(analyze).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("drops an older response after a newer revision", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(value: TestAnalysis) => void> = [];
    const analyze = vi.fn((request: AnalysisRequest) => new Promise<AnalysisResponse<TestAnalysis>>((resolve) => resolvers.push((analysis) => resolve({ ...request, analysis }))));
    const received = vi.fn();
    const client = createAnalysisClient(analyze, received);

    client.update({ source: "old", documentId: "one", revision: 1 });
    await vi.advanceTimersByTimeAsync(150);
    client.update({ source: "new", documentId: "one", revision: 2 });
    await vi.advanceTimersByTimeAsync(150);
    resolvers[0]({ value: "old" });
    await Promise.resolve();
    resolvers[1]({ value: "new" });
    await Promise.resolve();

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({ value: "new" });
  });

  it("drops responses from the previous document", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: TestAnalysis) => void;
    const analyze = vi.fn((request: AnalysisRequest) => new Promise<AnalysisResponse<TestAnalysis>>((resolve) => { resolveFirst = (analysis) => resolve({ ...request, analysis }); }));
    const received = vi.fn();
    const client = createAnalysisClient(analyze, received);
    client.update({ source: "old", documentId: "one", revision: 1 });
    await vi.advanceTimersByTimeAsync(150);
    client.update({ source: "new", documentId: "two", revision: 0 });
    resolveFirst({ value: "old" });
    await Promise.resolve();

    expect(received).not.toHaveBeenCalled();
  });

  it("keeps only the latest snapshot while one analysis is active", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(value: TestAnalysis) => void> = [];
    const analyze = vi.fn((request: AnalysisRequest) => new Promise<AnalysisResponse<TestAnalysis>>((resolve) => resolvers.push((analysis) => resolve({ ...request, analysis }))));
    const received = vi.fn();
    const client = createAnalysisClient(analyze, received);

    client.update({ source: "one", documentId: "doc", revision: 1 });
    await vi.advanceTimersByTimeAsync(150);
    client.update({ source: "two", documentId: "doc", revision: 2 });
    await vi.advanceTimersByTimeAsync(150);
    client.update({ source: "three", documentId: "doc", revision: 3 });
    await vi.advanceTimersByTimeAsync(150);
    expect(analyze).toHaveBeenCalledTimes(1);

    resolvers[0]({ value: "one" });
    await Promise.resolve();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][0].source).toBe("three");
  });

  it("continues with the latest snapshot after an analysis fails", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn()
      .mockRejectedValueOnce(new Error("worker stopped"))
      .mockImplementation(async (request: AnalysisRequest) => ({ ...request, analysis: { value: request.source } }));
    const received = vi.fn();
    const client = createAnalysisClient(analyze, received);

    client.update({ source: "broken", documentId: "doc", revision: 1 });
    await vi.advanceTimersByTimeAsync(150);
    client.update({ source: "recovered", documentId: "doc", revision: 2 });
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledWith({ value: "recovered" });
  });
});
