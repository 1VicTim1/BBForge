import { TooltipButton } from "../components/TooltipButton";
import { Fragment, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { PluginIcon, PluginItemView, uiAttributes, useSlot } from "../plugins/context";
import type { SlotEntry } from "../plugins/ui";

export type SidebarView = "outline" | "search" | "blocks";
interface Props {
  sidebar: SidebarView | null;
  onSidebar(view: SidebarView): void;
  problems: { errors: number; warnings: number; open: boolean; onToggle(): void };
  onSettings(): void;
  settingsActive: boolean;
}
const views: Array<[SidebarView, IconName, string, string]> = [
  ["outline", "outline", "Структура", "Показать или скрыть структуру документа"],
  ["search", "search", "Поиск", "Найти текст в документе"],
  ["blocks", "blocks", "Блоки", "Вставить спойлер, цитату, список и другие блоки"],
];

/** The vertical strip of tool windows left of the sidebar. */
export function ActivityBar({ sidebar, onSidebar, problems, onSettings, settingsActive }: Props) {
  const total = problems.errors + problems.warnings;
  type Render = (entry: SlotEntry<Render>) => ReactNode;
  const glyph = (entry: SlotEntry<Render>, icon: IconName) => entry.icon ? <PluginIcon icon={entry.icon} owner={entry.owner} /> : <Icon name={icon} />;
  const top = useSlot<Render>("activitybar", [
    ...views.map(([view, icon, label, description]): { id: string; value: Render } => ({ id: `activity.${view}`, value: (entry) => { const { className, ...rest } = uiAttributes(entry); return <TooltipButton {...rest} className={[sidebar === view ? "active" : "", className].filter(Boolean).join(" ")} aria-pressed={sidebar === view} label={entry.title ?? label} description={entry.tooltip ?? description} onClick={() => onSidebar(view)}>{glyph(entry, icon)}</TooltipButton>; } })),
    { id: "activity.problems", value: (entry) => { const { className, ...rest } = uiAttributes(entry); return <TooltipButton {...rest} className={[problems.open ? "toggled" : "", className].filter(Boolean).join(" ")} aria-pressed={problems.open} label={entry.title ?? "Проблемы"} description={entry.tooltip ?? "Показать найденные ошибки и предупреждения"} onClick={problems.onToggle}>
      {glyph(entry, "warning")}{total > 0 && <span className={`activity-badge ${problems.errors ? "error" : "warning"}`} aria-hidden="true">{total > 99 ? "99+" : total}</span>}
    </TooltipButton>; } },
  ]);
  const bottom = useSlot<Render>("activitybar.bottom", [
    { id: "activity.settings", value: (entry) => { const { className, ...rest } = uiAttributes(entry); return <TooltipButton {...rest} className={[settingsActive ? "toggled" : "", className].filter(Boolean).join(" ")} label={entry.title ?? "Настройки"} description={entry.tooltip ?? "Внешний вид, редактор кода, конструктор и поведение"} shortcut="Ctrl+Alt+S" onClick={onSettings}>{glyph(entry, "sliders")}</TooltipButton>; } },
  ]);
  const draw = (entries: SlotEntry<Render>[]) => entries.map((entry) => <Fragment key={entry.id}>{entry.builtin ? entry.builtin(entry) : <PluginItemView entry={entry} variant="activity" />}</Fragment>);
  return <nav className="tool-rail activity-bar" aria-label="Панели" data-ui-id="activitybar">
    {draw(top)}
    <span className="spacer" />
    {draw(bottom)}
  </nav>;
}
