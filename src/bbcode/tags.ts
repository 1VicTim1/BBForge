/** Tag vocabulary as the Rust linter knows it (crates/bbcode-core/src/lint.rs, KNOWN_TAGS). */
export const KNOWN_TAGS = ["b", "i", "u", "s", "size", "color", "font", "background", "url", "img", "spoiler", "list", "*", "quote", "code", "attachment", "left", "center", "right", "sub", "sup"];
const known = new Set(KNOWN_TAGS);

/** Visual role of a tag: drives its colour in the code editor, the structure tree and the inspector. */
export type TagRole = "inline" | "block" | "media" | "item" | "unknown";
const blocks = new Set(["spoiler", "quote", "code", "list", "left", "center", "right"]);
const media = new Set(["img", "attachment", "video"]);

export function tagRole(name: string | null | undefined): TagRole {
  const tag = (name ?? "").toLowerCase();
  if (!known.has(tag)) return "unknown";
  if (tag === "*") return "item";
  if (blocks.has(tag)) return "block";
  if (media.has(tag)) return "media";
  return "inline";
}

export const isKnownTag = (name: string | null | undefined) => known.has((name ?? "").toLowerCase());

/** "unknownTag" → "unknown-tag": rule codes are shown as kebab-case chips. */
export const ruleLabel = (code: string) => code.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export const SAFE_COLOR = /^(#[\da-f]{3,8}|[a-z]{1,20})$/i;

/** Russian plural: plural(3, ["блок", "блока", "блоков"]). */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10, mod100 = count % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${count} ${form}`;
}
