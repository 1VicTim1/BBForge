export interface AnalysisRequest {
  source: string;
  documentId: string;
  revision: number;
}

export interface AnalysisResponse<T> extends AnalysisRequest {
  analysis: T;
}

export function createAnalysisClient<T>(
  analyze: (request: AnalysisRequest) => Promise<AnalysisResponse<T>>,
  onResult: (analysis: T) => void,
  delay = 150,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: AnalysisRequest | undefined;

  return {
    update(request: AnalysisRequest) {
      latest = request;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const response = await analyze(request);
        if (latest?.documentId === response.documentId && latest.revision === response.revision) {
          onResult(response.analysis);
        }
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      latest = undefined;
    },
  };
}
