import type { Analysis, Diagnostic, Node } from "../analysis/types";
import { createPositionIndex } from "../document/positions";
import { tagSpec } from "../bbcode/profile";
import type { CheckerDef } from "./host";

/**
 * Checking the contents of [code] blocks with plugins (contributes.codeCheck). Each block goes to
 * every checker once per text; what they find becomes diagnostics of the document (code
 * "plugin:<id>"), shown with the analyser's own problems.
 */

/** What a checker returns for a block: offsets and lengths in the block's text (UTF-16). */
export interface CodeMatch { offset: number; length: number; message: string; severity?: string }
export interface CodeBlock { from: number; to: number; code: string; language: string | null }
type Found = Array<{ offset: number; length: number; message: string; severity: Diagnostic["severity"] }>;
export type RunChecker = (checker: CheckerDef, input: { code: string; language: string | null }) => Promise<unknown>;

export const PLUGIN_DIAGNOSTIC = "plugin:";
const MAX_CACHE = 2000, MAX_BLOCK = 200_000;

/** [code] and other raw blocks (UTF-16 ranges of their contents). */
export function codeBlocks(analysis: Analysis, source: string): CodeBlock[] {
  const index = createPositionIndex(source), blocks: CodeBlock[] = [];
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.kind !== "element") continue;
      if (tagSpec(node.name)?.raw && node.wellFormed) {
        const from = index.byteToUtf16(node.contentSpan.start), to = index.byteToUtf16(node.contentSpan.end);
        if (to > from && to - from <= MAX_BLOCK) blocks.push({ from, to, code: source.slice(from, to), language: node.parameter?.trim().toLowerCase() || null });
      } else walk(node.children);
    }
  };
  walk(analysis.nodes);
  return blocks;
}

export class CodeChecker {
  private cache = new Map<string, Found>();
  constructor(private checkers: CheckerDef[], private run: RunChecker) {}

  private key(checker: CheckerDef, block: CodeBlock) { return `${checker.owner}\u0000${block.language ?? ""}\u0000${block.code}`; }

  /** Diagnostics already known for the blocks of this text (no checker is asked). */
  cached(analysis: Analysis, source: string): Diagnostic[] {
    const blocks = codeBlocks(analysis, source);
    if (!blocks.length) return [];
    const encoder = new TextEncoder(), diagnostics: Diagnostic[] = [];
    for (const block of blocks) for (const checker of this.checkers) for (const item of this.cache.get(this.key(checker, block)) ?? []) {
      const from = block.from + item.offset, to = from + item.length, before = source.slice(0, from);
      const start = encoder.encode(before).length;
      diagnostics.push({
        code: `${PLUGIN_DIAGNOSTIC}${checker.owner}`, severity: item.severity, message: `${checker.title}: ${item.message}`,
        span: { start, end: start + encoder.encode(source.slice(from, to)).length },
        line: (before.match(/\n/g)?.length ?? 0) + 1, column: Array.from(before.slice(before.lastIndexOf("\n") + 1)).length + 1,
      });
    }
    return diagnostics;
  }

  /** Asks the checkers about blocks not seen before; true when something new is known. */
  async refresh(analysis: Analysis, source: string, cancelled: () => boolean = () => false, onError?: (checker: CheckerDef, error: unknown) => void): Promise<boolean> {
    let changed = false;
    for (const block of codeBlocks(analysis, source)) for (const checker of this.checkers) {
      const key = this.key(checker, block);
      if (this.cache.has(key) || cancelled()) continue;
      let result: unknown;
      try { result = await this.run(checker, { code: block.code, language: block.language }); } catch (error) { onError?.(checker, error); result = []; }
      if (cancelled()) return changed;
      const found: Found = (Array.isArray(result) ? result as CodeMatch[] : []).flatMap((match) => {
        if (!match || !Number.isInteger(match.offset) || !Number.isInteger(match.length) || match.offset < 0 || match.length < 0 || match.offset + match.length > block.code.length) return [];
        const severity: Diagnostic["severity"] = match.severity === "error" || match.severity === "info" ? match.severity : "warning";
        return [{ offset: match.offset, length: match.length, message: String(match.message ?? "").slice(0, 300), severity }];
      }).slice(0, 100);
      this.cache.set(key, found);
      changed = true;
      if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    }
    return changed;
  }
}

/** The analysis with plugin diagnostics replaced by `extra`. */
export function withPluginDiagnostics(analysis: Analysis, extra: Diagnostic[]): Analysis {
  const own = analysis.diagnostics.filter((item) => !item.code.startsWith(PLUGIN_DIAGNOSTIC));
  if (own.length === analysis.diagnostics.length && !extra.length) return analysis;
  return { ...analysis, diagnostics: [...own, ...extra] };
}
