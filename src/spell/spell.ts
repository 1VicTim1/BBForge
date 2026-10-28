/**
 * Spell checking of the document's text (not tags, not [code], not links): words are collected
 * here, checked in batches by the desktop side (Hunspell dictionaries) and remembered.
 */
export interface SpellBackend {
  check(words: string[]): Promise<boolean[]>;
  suggest(word: string): Promise<string[]>;
  add(word: string): Promise<void>;
  /** Whether the user added these words to their dictionary. */
  userHas?(words: string[]): Promise<boolean[]>;
  /** Which dictionaries to use (files of plugin packages); returns a problem per dictionary, if any. */
  configure?(dictionaries: DictionarySource[]): Promise<Array<{ plugin: string; language: string; error: string | null }>>;
}
export interface DictionarySource { plugin: string; version: string; language: string; aff: string; dic: string }
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

const IGNORED_KEY = "bbforge.spelling.ignored";
function loadIgnored(): string[] {
  try { const value = JSON.parse(localStorage.getItem(IGNORED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}
function saveIgnored(words: string[]) { try { localStorage.setItem(IGNORED_KEY, JSON.stringify(words.slice(-5000))); } catch { /* storage unavailable */ } }

export class SpellChecker {
  private known = new Map<string, boolean>();
  private ignored = new Set<string>(loadIgnored());
  private added = new Set<string>();
  constructor(private backend: SpellBackend) {}

  /** Words a checker of grammar may still call misspelt but the user accepted (added or skipped). */
  async accepted(words: string[]): Promise<Set<string>> {
    const unique = [...new Set(words.map((word) => word.toLowerCase()))];
    const own = await this.backend.userHas?.(unique).catch(() => null) ?? null;
    return new Set(unique.filter((word, index) => this.ignored.has(word) || this.added.has(word) || own?.[index]));
  }

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

  /** New set of dictionaries: every word is checked again. */
  async configure(dictionaries: DictionarySource[]) {
    const states = await this.backend.configure?.(dictionaries) ?? [];
    this.known.clear();
    return states;
  }

  /** Into the user's dictionary, for good. */
  async add(word: string) { await this.backend.add(word); this.known.set(word, true); this.added.add(word.toLowerCase()); }

  /** Not marked any more (remembered between runs, apart from the dictionary). */
  ignore(word: string) { this.ignored.add(word.toLowerCase()); saveIgnored([...this.ignored]); }
}

declare global {
  interface Window {
    /** Browser tests check spelling with this instead of the desktop dictionaries. */
    __BBFORGE_SPELL__?: SpellBackend;
  }
}
