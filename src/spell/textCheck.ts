/**
 * Checking the text between tags with a plugin's service (grammar and style, e.g. LanguageTool).
 * The text is cut into paragraphs (line breaks and block tags end one); only paragraphs not seen
 * before are sent, several at a time, and what the service finds is moved back onto the source.
 */

export type IssueKind = "spelling" | "grammar" | "style";
export interface TextIssue { from: number; to: number; message: string; replacements: string[]; kind: IssueKind; checker: string }
/** What a checker script returns for a text: offsets and lengths in that text (UTF-16). */
export interface CheckerMatch { offset: number; length: number; message?: string; replacements?: string[]; kind?: string }
export type CheckerFn = (text: string) => Promise<CheckerMatch[]>;

interface Piece { at: number; from: number; length: number }
export interface Paragraph { text: string; pieces: Piece[] }
type Found = Array<{ offset: number; length: number; message: string; replacements: string[]; kind: IssueKind }>;

/**
 * Paragraphs of the text segments (UTF-16 ranges of `source`, in order). Between two segments,
 * `breaks(gap)` tells whether the markup there ends the paragraph (a block tag, not [b]).
 */
export function paragraphsOf(source: string, segments: Array<{ from: number; to: number }>, breaks: (gap: string) => boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph = { text: "", pieces: [] }, previous: number | null = null;
  const close = () => { if (current.text.trim()) paragraphs.push(current); current = { text: "", pieces: [] }; };
  for (const segment of segments) {
    if (previous !== null && breaks(source.slice(previous, segment.from))) close();
    let from = segment.from;
    for (const line of source.slice(segment.from, segment.to).split("\n")) {
      if (from > segment.from) close();
      if (line) { current.pieces.push({ at: current.text.length, from, length: line.length }); current.text += line; }
      from += line.length + 1;
    }
    previous = segment.to;
  }
  close();
  return paragraphs;
}

/** Source offset of an offset in a paragraph (`end`: the end of a range, which may sit at a piece's end). */
function toSource(paragraph: Paragraph, offset: number, end: boolean): number | null {
  for (const piece of paragraph.pieces) if (end ? offset > piece.at && offset <= piece.at + piece.length : offset >= piece.at && offset < piece.at + piece.length) return piece.from + offset - piece.at;
  return null;
}

const KINDS: IssueKind[] = ["spelling", "grammar", "style"];
const MAX_BATCH = 12_000, MAX_CACHE = 4000;

export class TextChecker {
  private cache = new Map<string, Found>();
  constructor(private name: string, private check: CheckerFn) {}

  /** Issues in the paragraphs; `cancelled()` stops between requests (the document changed). */
  async issues(paragraphs: Paragraph[], cancelled: () => boolean = () => false): Promise<TextIssue[]> {
    const missing = [...new Set(paragraphs.map((item) => item.text).filter((text) => !this.cache.has(text) && /\p{L}/u.test(text)))];
    for (let start = 0; start < missing.length && !cancelled();) {
      const batch: string[] = [];
      let size = 0;
      while (start < missing.length && (batch.length === 0 || size + missing[start].length + 2 <= MAX_BATCH)) { batch.push(missing[start]); size += missing[start].length + 2; start++; }
      const joined = batch.map((text) => text.slice(0, 20_000)).join("\n\n");
      const matches = await this.check(joined);
      if (cancelled()) break;
      let at = 0;
      for (const text of batch) {
        const length = Math.min(text.length, 20_000), found: Found = [];
        for (const match of matches) {
          if (!Number.isInteger(match.offset) || !Number.isInteger(match.length) || match.length <= 0 || match.offset < at || match.offset + match.length > at + length) continue;
          found.push({
            offset: match.offset - at, length: match.length, message: typeof match.message === "string" ? match.message.slice(0, 300) : "",
            replacements: Array.isArray(match.replacements) ? match.replacements.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) => item.slice(0, 200)) : [],
            kind: KINDS.includes(match.kind as IssueKind) ? match.kind as IssueKind : "grammar",
          });
        }
        this.cache.set(text, found);
        at += length + 2;
      }
      if (this.cache.size > MAX_CACHE) for (const key of [...this.cache.keys()].slice(0, this.cache.size - MAX_CACHE)) this.cache.delete(key);
    }
    const issues: TextIssue[] = [];
    for (const paragraph of paragraphs) for (const item of this.cache.get(paragraph.text) ?? []) {
      const from = toSource(paragraph, item.offset, false), to = toSource(paragraph, item.offset + item.length, true);
      if (from !== null && to !== null && to > from) issues.push({ from, to, message: item.message, replacements: item.replacements, kind: item.kind, checker: this.name });
    }
    return issues;
  }
}
