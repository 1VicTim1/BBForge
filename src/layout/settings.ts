export type WorkspaceMode = "code" | "builder" | "split";
export interface LayoutSettings { mode: WorkspaceMode; outlineWidth: number; splitRatio: number; problemsHeight: number; showOutline: boolean; showProblems: boolean }
export const defaultLayout: LayoutSettings = { mode: "split", outlineWidth: 244, splitRatio: .5, problemsHeight: 168, showOutline: true, showProblems: true };
const clamp = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
function validate(value: Partial<LayoutSettings>): LayoutSettings {
  return { mode: ["code", "builder", "split"].includes(value.mode ?? "") ? value.mode! : defaultLayout.mode,
    outlineWidth: clamp(value.outlineWidth, 180, 480, 244), splitRatio: clamp(value.splitRatio, .25, .75, .5), problemsHeight: clamp(value.problemsHeight, 100, 400, 168),
    showOutline: typeof value.showOutline === "boolean" ? value.showOutline : true, showProblems: typeof value.showProblems === "boolean" ? value.showProblems : true };
}
export function loadLayout(storage: Storage): LayoutSettings { try { const value: unknown = JSON.parse(storage.getItem("bbforge.layout") ?? "null"); return value && typeof value === "object" ? validate(value) : { ...defaultLayout }; } catch { return { ...defaultLayout }; } }
export function saveLayout(storage: Storage, settings: LayoutSettings): void { try { storage.setItem("bbforge.layout", JSON.stringify(validate(settings))); } catch { /* storage unavailable */ } }
