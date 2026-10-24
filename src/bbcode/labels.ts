import type { Node } from "../analysis/types";
import type { PositionIndex } from "../document/positions";
import { isKnownTag, plural } from "./tags";

export const stripTags = (value: string) => value.replace(/\[[^\]\n]*\]/g, "").replace(/\s+/g, " ").trim();

/** "https://www.4pda.to/forum/index.php" → "4pda.to/forum/index.php" (shortened). */
export function hostAndPath(raw: string): string {
  const value = raw.replace(/^["']|["']$/g, "");
  try { const url = new URL(value); const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, ""); return url.hostname.replace(/^www\./, "") + (path.length > 24 ? `${path.slice(0, 22)}…` : path); }
  catch { return value; }
}

export function nodeText(node: Node, source: string, index: PositionIndex): string {
  return stripTags(source.slice(index.byteToUtf16(node.contentSpan.start), index.byteToUtf16(node.contentSpan.end)));
}

/** Human caption of a block: spoiler → its title, url → domain/path, img → file name, color → text or value. */
export function nodeLabel(node: Node, source: string, index: PositionIndex): string {
  const name = node.name ?? "", text = () => nodeText(node, source, index);
  if (!isKnownTag(name)) return node.wellFormed ? "неизвестный тег" : "повреждённая разметка";
  if (name === "spoiler") return stripTags(node.parameter ?? "") || "Спойлер";
  if (name === "url") return hostAndPath(node.parameter ?? text()) || text();
  if (name === "img") { const value = text(); return value.split(/[\\/]/).at(-1)?.split("?")[0] || value; }
  if (name === "list") return plural(node.children.filter((child) => child.name === "*").length, ["пункт", "пункта", "пунктов"]);
  if (name === "color" || name === "background") return text() || (node.parameter ?? "");
  if (name === "attachment") return node.parameter ?? "";
  return text() || (node.parameter ?? "");
}
