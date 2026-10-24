import { TooltipButton } from "../components/TooltipButton";
import { Icon, type IconName } from "../components/Icon";

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
  return <nav className="tool-rail activity-bar" aria-label="Панели">
    {views.map(([view, icon, label, description]) => <TooltipButton key={view} className={sidebar === view ? "active" : ""} aria-pressed={sidebar === view} label={label} description={description} onClick={() => onSidebar(view)}><Icon name={icon} /></TooltipButton>)}
    <TooltipButton className={problems.open ? "toggled" : ""} aria-pressed={problems.open} label="Проблемы" description="Показать найденные ошибки и предупреждения" onClick={problems.onToggle}>
      <Icon name="warning" />{total > 0 && <span className={`activity-badge ${problems.errors ? "error" : "warning"}`} aria-hidden="true">{total > 99 ? "99+" : total}</span>}
    </TooltipButton>
    <span className="spacer" />
    <TooltipButton className={settingsActive ? "toggled" : ""} label="Настройки" description="Внешний вид, редактор кода, конструктор и поведение" shortcut="Ctrl+Alt+S" onClick={onSettings}><Icon name="sliders" /></TooltipButton>
  </nav>;
}
