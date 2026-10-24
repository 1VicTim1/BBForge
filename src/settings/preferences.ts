import { createContext, useContext } from "react";
import { validateOverrides, type KeymapOverrides } from "../keymap/keymap";

export type Theme = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";
export interface Preferences {
  theme: Theme;
  density: Density;
  /** Linux/Windows: the window manager's title bar instead of BBForge's own. */
  systemFrame: boolean;
  tooltips: boolean;
  animations: boolean;
  codeFontSize: number;
  codeLineHeight: number;
  codeWrap: boolean;
  codeLineNumbers: boolean;
  codeActiveLine: boolean;
  builderFontSize: number;
  builderWidth: "narrow" | "medium" | "full";
  spoilerOpenDepth: number;
  tagLabels: boolean;
  restoreSession: boolean;
  analysisDelay: number;
  keymap: KeymapOverrides;
}

export const defaultPreferences: Preferences = {
  theme: "dark", density: "comfortable", systemFrame: false,
  tooltips: true, animations: true,
  codeFontSize: 13, codeLineHeight: 1.54, codeWrap: true, codeLineNumbers: true, codeActiveLine: true,
  builderFontSize: 14, builderWidth: "medium", spoilerOpenDepth: 2, tagLabels: true,
  restoreSession: true, analysisDelay: 150, keymap: {},
};

const KEY = "bbforge.preferences";
const number = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

export function validatePreferences(value: Partial<Preferences>): Preferences {
  const d = defaultPreferences;
  return {
    theme: value.theme === "light" || value.theme === "system" ? value.theme : d.theme,
    density: value.density === "compact" ? "compact" : d.density,
    systemFrame: flag(value.systemFrame, d.systemFrame),
    tooltips: flag(value.tooltips, d.tooltips), animations: flag(value.animations, d.animations),
    codeFontSize: number(value.codeFontSize, 11, 18, d.codeFontSize), codeLineHeight: number(value.codeLineHeight, 1.2, 2.2, d.codeLineHeight),
    codeWrap: flag(value.codeWrap, d.codeWrap), codeLineNumbers: flag(value.codeLineNumbers, d.codeLineNumbers), codeActiveLine: flag(value.codeActiveLine, d.codeActiveLine),
    builderFontSize: number(value.builderFontSize, 12, 20, d.builderFontSize),
    builderWidth: value.builderWidth === "narrow" || value.builderWidth === "full" || value.builderWidth === "medium" ? value.builderWidth : d.builderWidth,
    spoilerOpenDepth: number(value.spoilerOpenDepth, 0, 99, d.spoilerOpenDepth), tagLabels: flag(value.tagLabels, d.tagLabels),
    restoreSession: flag(value.restoreSession, d.restoreSession), analysisDelay: number(value.analysisDelay, 50, 2000, d.analysisDelay),
    keymap: validateOverrides(value.keymap),
  };
}

export function loadPreferences(storage: Storage): Preferences {
  try { const value: unknown = JSON.parse(storage.getItem(KEY) ?? "null"); return value && typeof value === "object" ? validatePreferences(value) : { ...defaultPreferences }; }
  catch { return { ...defaultPreferences }; }
}

export function savePreferences(storage: Storage, preferences: Preferences): void {
  try { storage.setItem(KEY, JSON.stringify(validatePreferences(preferences))); } catch { /* storage unavailable */ }
}

/** CSS classes and variables that apply the preferences to the whole window. */
export function preferenceStyle(preferences: Preferences): { className: string; style: Record<string, string> } {
  const classes = [
    !preferences.tooltips && "pref-no-tooltips", !preferences.animations && "pref-no-animations",
    !preferences.codeWrap && "pref-no-wrap", !preferences.codeLineNumbers && "pref-no-line-numbers", !preferences.codeActiveLine && "pref-no-active-line",
    !preferences.tagLabels && "pref-no-tag-labels",
  ].filter(Boolean).join(" ");
  return {
    className: classes,
    style: {
      "--code-font-size": `${preferences.codeFontSize}px`, "--code-line-height": String(preferences.codeLineHeight),
      "--builder-font-size": `${preferences.builderFontSize}px`,
      "--builder-page-width": preferences.builderWidth === "narrow" ? "620px" : preferences.builderWidth === "full" ? "none" : "700px",
    },
  };
}

/** The theme actually shown: "system" follows the OS setting. */
export function resolvedTheme(theme: Theme, prefersDark: boolean): "dark" | "light" {
  return theme === "system" ? prefersDark ? "dark" : "light" : theme;
}

export const PreferencesContext = createContext<Preferences>(defaultPreferences);
export const usePreferences = () => useContext(PreferencesContext);
