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
  onResult: (analysis: T, snapshot: AnalysisResponse<T>) => void,
  delay = 150,
  onError: (error: unknown) => void = () => undefined,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: AnalysisRequest | undefined;
  let active = false;
  let pending: AnalysisRequest | undefined;

  async function run(request: AnalysisRequest) {
    active = true;
    try {
      const response = await analyze(request);
      if (latest?.documentId === response.documentId && latest.revision === response.revision) {
        onResult(response.analysis, response);
      }
    } catch (error) {
      if (latest?.documentId === request.documentId && latest.revision === request.revision) onError(error);
    } finally {
      active = false;
      if (pending) {
        const next = pending;
        pending = undefined;
        void run(next);
      }
    }
  }

  return {
    update(request: AnalysisRequest) {
      latest = request;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (active) pending = request;
        else void run(request);
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      latest = undefined;
      pending = undefined;
    },
  };
}
