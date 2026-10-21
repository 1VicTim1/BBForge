import type { AnalysisRequest, AnalysisResponse } from "./client";

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export function createTauriAnalyzer<T>(invoke: Invoke) {
  return async (request: AnalysisRequest) => await invoke("analyze", {
    source: request.source,
    documentId: request.documentId,
    revision: request.revision,
  }) as AnalysisResponse<T>;
}
