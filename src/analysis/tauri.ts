import type { AnalysisRequest, AnalysisResponse } from "./client";
import type { TagProfile } from "../bbcode/profile";
type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
/** `profile` returns the forum profile the analyser checks tags against; null keeps the built-in one. */
export function createTauriAnalyzer<T>(invoke: Invoke, profile: () => TagProfile | null = () => null) {
  return async (request: AnalysisRequest): Promise<AnalysisResponse<T>> => {
    const response = await invoke("analyze", {
      source: request.source,
      documentId: request.documentId,
      revision: request.revision,
      profile: profile(),
    }) as Omit<AnalysisResponse<T>, "source">;
    return { ...response, source: request.source };
  };
}
