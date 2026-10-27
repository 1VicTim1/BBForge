/** The tag vocabulary lives in the active forum profile (./profile.ts). */
export { isKnownTag, tagRole, type TagRole } from "./profile";

/** "unknownTag" → "unknown-tag": rule codes are shown as kebab-case chips. */
export const ruleLabel = (code: string) => code.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export const SAFE_COLOR = /^(#[\da-f]{3,8}|[a-z]{1,20})$/i;

/** Russian plural: plural(3, ["блок", "блока", "блоков"]). */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10, mod100 = count % 100;
  const form = mod10 === 1 && mod100 !== 11 ? forms[0] : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? forms[1] : forms[2];
  return `${count} ${form}`;
}
