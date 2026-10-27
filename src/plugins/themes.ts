import tokensCss from "../styles/tokens.css?raw";
import type { OwnedPatch } from "./ui";

/**
 * Themes: a base (dark or light) plus overrides of the design tokens from styles/tokens.css,
 * optional CSS and optional interface patches (order, names, icons of items) applied while the
 * theme is active.
 */
export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  base: "dark" | "light";
  tokens: Record<string, string>;
  css: string;
  patches: OwnedPatch[];
  /** Package that added the theme; null for the built-in ones. */
  source: string | null;
}

/** Tokens a theme may set: every custom property declared in tokens.css. */
export const THEME_TOKENS = new Set([...tokensCss.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map((match) => match[1]));
/** Colours, lengths, font lists, shadows and timings — never url(), expressions, escapes or new declarations. */
const SAFE_TOKEN_VALUE = /^[#\w\s.,%()+\-/"']{1,200}$/;
const UNSAFE = /url\s*\(|expression|image-set|\\|;|\{|\}|@import/i;
export const safeTokenValue = (value: string) => SAFE_TOKEN_VALUE.test(value) && !UNSAFE.test(value);

export const BUILTIN_THEMES: ThemeDef[] = [
  { id: "dark", name: "Тёмная", description: "", base: "dark", tokens: {}, css: "", patches: [], source: null },
  { id: "light", name: "Светлая", description: "", base: "light", tokens: {}, css: "", patches: [], source: null },
];

/** Checks a theme from a package. `css` and `patches` are attached by the host after permission checks. */
export function validateTheme(raw: unknown, source: string): { theme: ThemeDef | null; problems: string[]; styles: string[]; ui: unknown[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== "object") return { theme: null, problems: ["тема должна быть объектом"], styles: [], ui: [] };
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) || id === "dark" || id === "light" || id === "system") return { theme: null, problems: [`неверный id темы «${id}»`], styles: [], ui: [] };
  const tokens: Record<string, string> = {};
  if (value.tokens && typeof value.tokens === "object") for (const [name, token] of Object.entries(value.tokens)) {
    if (!THEME_TOKENS.has(name)) { problems.push(`тема ${id}: неизвестный токен ${name}`); continue; }
    if (typeof token !== "string" || !safeTokenValue(token)) { problems.push(`тема ${id}: недопустимое значение ${name}`); continue; }
    tokens[name] = token;
  }
  const styles = Array.isArray(value.styles) ? value.styles.filter((item): item is string => typeof item === "string") : [];
  return {
    theme: {
      id, name: typeof value.name === "string" && value.name.trim() ? value.name.slice(0, 80) : id,
      description: typeof value.description === "string" ? value.description.slice(0, 300) : "",
      base: value.base === "light" ? "light" : "dark", tokens, css: "", patches: [], source,
    },
    problems, styles, ui: Array.isArray(value.ui) ? value.ui : [],
  };
}

const STYLE_ID = "bbforge-theme-css";
/** Applies a theme to the whole window: data-theme for the base, inline tokens, and its CSS. */
export function applyTheme(theme: ThemeDef, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme.base;
  for (const name of Array.from(root.style)) if (name.startsWith("--") && THEME_TOKENS.has(name)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
  let style = document.getElementById(STYLE_ID);
  if (!theme.css) { style?.remove(); return; }
  if (!style) { style = document.createElement("style"); style.id = STYLE_ID; document.head.append(style); }
  style.textContent = theme.css;
}
