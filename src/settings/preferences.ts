import { createContext, useContext } from "react";

export interface Preferences {
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
}

export const defaultPreferences: Preferences = {
  tooltips: true, animations: true,
  codeFontSize: 13, codeLineHeight: 1.6, codeWrap: true, codeLineNumbers: true, codeActiveLine: true,
  builderFontSize: 14, builderWidth: "medium", spoilerOpenDepth: 2, tagLabels: true,
  restoreSession: true, analysisDelay: 150,
};

const KEY = "bbforge.preferences";
const number = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

export function validatePreferences(value: Partial<Preferences>): Preferences {
  const d = defaultPreferences;
  return {
    tooltips: flag(value.tooltips, d.tooltips), animations: flag(value.animations, d.animations),
    codeFontSize: number(value.codeFontSize, 10, 24, d.codeFontSize), codeLineHeight: number(value.codeLineHeight, 1.2, 2.2, d.codeLineHeight),
    codeWrap: flag(value.codeWrap, d.codeWrap), codeLineNumbers: flag(value.codeLineNumbers, d.codeLineNumbers), codeActiveLine: flag(value.codeActiveLine, d.codeActiveLine),
    builderFontSize: number(value.builderFontSize, 11, 24, d.builderFontSize),
    builderWidth: value.builderWidth === "narrow" || value.builderWidth === "full" || value.builderWidth === "medium" ? value.builderWidth : d.builderWidth,
    spoilerOpenDepth: number(value.spoilerOpenDepth, 0, 99, d.spoilerOpenDepth), tagLabels: flag(value.tagLabels, d.tagLabels),
    restoreSession: flag(value.restoreSession, d.restoreSession), analysisDelay: number(value.analysisDelay, 50, 2000, d.analysisDelay),
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
      "--builder-page-width": preferences.builderWidth === "narrow" ? "720px" : preferences.builderWidth === "full" ? "none" : "900px",
    },
  };
}

export const PreferencesContext = createContext<Preferences>(defaultPreferences);
export const usePreferences = () => useContext(PreferencesContext);
