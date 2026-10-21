export interface Span { start: number; end: number }
export interface Diagnostic { code: string; severity: "error" | "warning"; message: string; span: Span; line: number; column: number }
export interface Node { kind: "text" | "element"; span: Span; name: string | null; parameter: string | null; children: Node[] }
export interface Analysis { nodes: Node[]; diagnostics: Diagnostic[]; tokens: unknown[] }

export const emptyAnalysis = (): Analysis => ({ nodes: [], diagnostics: [], tokens: [] });

declare global {
  interface Window {
    __BBFORGE_ANALYZE__?: (request: import("./client").AnalysisRequest) => Promise<import("./client").AnalysisResponse<Analysis>>;
  }
}
