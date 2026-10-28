/**
 * Spell checking of the document's text (not tags, not [code], not links): words are collected
 * here, checked in batches by the desktop side (Hunspell dictionaries) and remembered.
 */
export interface SpellBackend {
  check(words: string[]): Promise<boolean[]>;
  suggest(word: string): Promise<string[]>;
  add(word: string): Promise<void>;
}
export interface Misspelling { from: number; to: number; word: string }

const WORD = /\p{L}+(?:[-'’]\p{L}+)*/gu;
// Addresses, e-mails and file names are not words.
const NOT_TEXT = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s[\]"]+|[\w.+-]+@[\w-]+\.[\w.-]+|[\w-]+(?:\.[\w-]+)+(?:\/[^\s[\]"]*)?/giu;

/** Words of the text pieces `segments` (UTF-16 ranges of `text`). */
export function wordsIn(text: string, segments: Array<{ from: number; to: number }>): Misspelling[] {
  const words: Misspelling[] = [];
  for (const segment of segments) {
    const part = text.slice(segment.from, segment.to);
    const skipped = [...part.matchAll(NOT_TEXT)].map((match) => [match.index, match.index + match[0].length] as const);
    for (const match of part.matchAll(WORD)) {
      const from = match.index, to = from + match[0].length;
      if (skipped.some(([start, end]) => from < end && to > start)) continue;
      words.push({ from: segment.from + from, to: segment.from + to, word: match[0] });
    }
  }
  return words;
}

export class SpellChecker {
  private known = new Map<string, boolean>();
  private ignored = new Set<string>();
  constructor(private backend: SpellBackend) {}

  /** Misspelt words of the text pieces; unknown words are checked in one batch. */
  async misspellings(text: string, segments: Array<{ from: number; to: number }>): Promise<Misspelling[]> {
    const words = wordsIn(text, segments);
    const unknown = [...new Set(words.map((item) => item.word).filter((word) => !this.known.has(word)))];
    for (let at = 0; at < unknown.length; at += 5000) {
      const batch = unknown.slice(at, at + 5000), results = await this.backend.check(batch);
      batch.forEach((word, index) => this.known.set(word, results[index] ?? true));
    }
    return words.filter((item) => this.known.get(item.word) === false && !this.ignored.has(item.word.toLowerCase()));
  }

  suggest(word: string) { return this.backend.suggest(word); }

  /** Into the user's dictionary, for good. */
  async add(word: string) { await this.backend.add(word); this.known.set(word, true); }

  /** Until BBForge is restarted. */
  ignore(word: string) { this.ignored.add(word.toLowerCase()); }
}

declare global {
  interface Window {
    /** Browser tests check spelling with this instead of the desktop dictionaries. */
    __BBFORGE_SPELL__?: SpellBackend;
  }
}
