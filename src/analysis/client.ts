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
  let active = false;
  let pending: AnalysisRequest | undefined;

  async function run(request: AnalysisRequest) {
    active = true;
    try {
      const response = await analyze(request);
      if (latest?.documentId === response.documentId && latest.revision === response.revision) {
        onResult(response.analysis);
      }
    } catch {
      // A worker or IPC failure must not block later snapshots.
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
