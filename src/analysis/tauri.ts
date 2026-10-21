import type { AnalysisRequest, AnalysisResponse } from "./client";

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export function createTauriAnalyzer<T>(invoke: Invoke) {
  return async (request: AnalysisRequest): Promise<AnalysisResponse<T>> => {
    const response = await invoke("analyze", {
      source: request.source,
      documentId: request.documentId,
      revision: request.revision,
    }) as Omit<AnalysisResponse<T>, "source">;
    return { ...response, source: request.source };
  };
}
