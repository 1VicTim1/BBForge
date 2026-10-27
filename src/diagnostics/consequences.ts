/**
 * A fast approximation of the Rust parser's structural checks (unclosed, unexpected and crossed tags),
 * used to compare fix candidates before the real analysis runs.
 */
const TAG = /\[(\/)?([a-z*][\w*-]*)(?:=(?:"[^"]*"|[^\]])*)?\]/gi;
import { activeProfile } from "../bbcode/profile";

export function countStructuralErrors(text: string): number {
  const stack: string[] = [], tags = activeProfile().tags;
  const builtin = (name: string) => tags.get(name)?.builtin ?? null;
  let errors = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(text); match; match = TAG.exec(text)) {
    const closing = Boolean(match[1]), name = match[2].toLowerCase();
    if (!closing) {
      if (tags.get(name)?.raw) {
        const closingTag = `[/${name}]`, end = text.toLowerCase().indexOf(closingTag, TAG.lastIndex);
        if (end < 0) { errors++; break; }
        TAG.lastIndex = end + closingTag.length; continue;
      }
      if (builtin(name) === "*") { if (stack.at(-1) === "*") stack.pop(); stack.push("*"); continue; }
      if (tags.get(name)?.leaf) continue;
      stack.push(name); continue;
    }
    if (builtin(name) === "list" && stack.at(-1) === "*") stack.pop();
    const at = stack.lastIndexOf(name);
    if (at < 0) { errors++; continue; }
    if (at !== stack.length - 1) errors++;
    stack.splice(at);
  }
  return errors + stack.filter((name) => name !== "*").length;
}

export function describeImpact(before: number, after: number): string {
  if (after < before) return `устраняет ${before - after} ${plural(before - after, "ошибку", "ошибки", "ошибок")}`;
  if (after > before) return `добавит ${after - before} ${plural(after - before, "новую ошибку", "новые ошибки", "новых ошибок")}`;
  return "число ошибок не изменится";
}
function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100;
  return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
