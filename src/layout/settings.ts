/** "split" shows the code next to the visual pane; the visual pane is the builder or, with showPreview, the preview. */
export type WorkspaceMode = "code" | "builder" | "split";
export type SidebarView = "outline" | "search" | "blocks";
export interface LayoutSettings {
  mode: WorkspaceMode; outlineWidth: number; splitRatio: number; problemsHeight: number; showOutline: boolean; showProblems: boolean;
  sidebarView: SidebarView; showInspector: boolean; inspectorWidth: number;
}
export const defaultLayout: LayoutSettings = { mode: "split", outlineWidth: 256, splitRatio: .5, problemsHeight: 172, showOutline: true, showProblems: false, sidebarView: "outline", showInspector: true, inspectorWidth: 264 };
const clamp = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
function validate(value: Partial<LayoutSettings>): LayoutSettings {
  return { mode: ["code", "builder", "split"].includes(value.mode ?? "") ? value.mode! : defaultLayout.mode,
    outlineWidth: clamp(value.outlineWidth, 200, 480, defaultLayout.outlineWidth), splitRatio: clamp(value.splitRatio, .25, .75, .5), problemsHeight: clamp(value.problemsHeight, 100, 400, defaultLayout.problemsHeight),
    showOutline: flag(value.showOutline, true), showProblems: flag(value.showProblems, false),
    sidebarView: value.sidebarView === "search" || value.sidebarView === "blocks" ? value.sidebarView : "outline",
    showInspector: flag(value.showInspector, true), inspectorWidth: clamp(value.inspectorWidth, 220, 420, defaultLayout.inspectorWidth) };
}
export function loadLayout(storage: Storage): LayoutSettings { try { const value: unknown = JSON.parse(storage.getItem("bbforge.layout") ?? "null"); return value && typeof value === "object" ? validate(value) : { ...defaultLayout }; } catch { return { ...defaultLayout }; } }
export function saveLayout(storage: Storage, settings: LayoutSettings): void { try { storage.setItem("bbforge.layout", JSON.stringify(validate(settings))); } catch { /* storage unavailable */ } }
