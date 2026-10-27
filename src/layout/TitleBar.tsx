import { Fragment, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { useMenuDismiss } from "../components/menuDismiss";
import type { Command } from "../commands/registry";
import type { Diagnostic } from "../analysis/types";
import { plural } from "../bbcode/tags";
import { PluginIcon, PluginItemView, useSlot } from "../plugins/context";

/** A menu after plugin patches; `id` is its slot ("menu.file"). Items are commands or separators (null). */
export interface MenuDefinition { id?: string; title: string; className?: string; items: Array<(Command & { uiId?: string; className?: string; owner?: string }) | null> }
interface Props {
  menus: MenuDefinition[];
  documentName: string;
  onCommandCenter(): void;
  commandCenterKey?: string;
  onSettings(): void;
  settingsKey?: string;
  exportPanel: ExportPanelProps;
  /** Own minimise/maximise/close buttons when the system frame is off (desktop only). */
  windowControls?: { minimize(): void; toggleMaximize(): void; close(): void } | null;
}

export function TitleBar(props: Props) {
  const menus = useRef<HTMLElement>(null); useMenuDismiss(menus);
  const close = (event: React.MouseEvent<HTMLElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
  return <header className="toolbar titlebar" data-tauri-drag-region>
    <div className="brand-icon" aria-hidden="true">BF</div><h1 className="sr-only">BBForge</h1>
    <nav className="app-menus" aria-label="Главное меню" ref={menus}>
      {props.menus.map((menu) => <details key={menu.id ?? menu.title} className={["app-menu", menu.className].filter(Boolean).join(" ")} data-ui-id={menu.id}><summary>{menu.title}</summary><div className="app-menu-popup" role="menu">
        {menu.items.map((item, at) => item === null ? <span key={at} className="menu-separator" /> : <button key={item.uiId ?? item.id} data-ui-id={item.uiId ?? item.id} className={item.className} role="menuitem" title={item.hint} disabled={item.enabled === false} onClick={(event) => { close(event); item.run(); }}>
          <span className="menu-label">{item.icon && <PluginIcon icon={item.icon} owner={item.owner} />}<span>{item.title}</span></span>{item.keys?.[0] && <kbd>{item.keys[0]}</kbd>}
        </button>)}
      </div></details>)}
    </nav>
    <div className="command-center-slot" data-tauri-drag-region>
      <button className="command-center" onClick={props.onCommandCenter} aria-label="Командный центр: перейти к файлу или команде">
        <Icon name="search" /><span className="command-center-file">{props.documentName}</span><span className="command-center-hint">Рабочее пространство</span>{props.commandCenterKey && <kbd>{props.commandCenterKey}</kbd>}
      </button>
    </div>
    <div className="titlebar-actions">
      <TitlebarActions />
      <ExportButton {...props.exportPanel} />
      <button className="icon-button" aria-label="Настройки" title={props.settingsKey ? `Настройки (${props.settingsKey})` : "Настройки"} onClick={props.onSettings}><Icon name="settings" /></button>
      {props.windowControls && <div className="window-controls">
        <button aria-label="Свернуть" onClick={props.windowControls.minimize}><Icon name="minimize" /></button>
        <button aria-label="Развернуть" onClick={props.windowControls.toggleMaximize}><Icon name="maximize" /></button>
        <button aria-label="Закрыть окно" className="window-close" onClick={props.windowControls.close}><Icon name="close" /></button>
      </div>}
    </div>
  </header>;
}

/** Plugin buttons and selects placed in the title bar ("titlebar.actions"). */
function TitlebarActions() {
  const entries = useSlot("titlebar.actions", []);
  return <>{entries.map((entry) => <Fragment key={entry.id}><PluginItemView entry={entry} variant="titlebar" /></Fragment>)}</>;
}

export interface ExportAction { id: string; title: string; hint?: string; icon?: Parameters<typeof Icon>[0]["name"]; disabled?: boolean; run(): void }
interface ExportPanelProps { diagnostics: Diagnostic[]; actions: ExportAction[]; onNavigate(diagnostic: Diagnostic): void; extra?: ReactNode }

/** "Экспорт": a pre-flight check (problems with links to them) above the export actions. */
function ExportButton({ diagnostics, actions, onNavigate }: ExportPanelProps) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null);
  const errors = diagnostics.filter((item) => item.severity === "error"), warnings = diagnostics.filter((item) => item.severity === "warning");
  const shown = [...errors, ...warnings].slice(0, 5);
  return <div className="export-anchor" ref={root} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
    <button className="export-button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}><Icon name="upload" />Экспорт</button>
    {open && <><div className="popover-dismiss" onPointerDown={() => setOpen(false)} /><section className="export-popover popover" role="dialog" aria-label="Экспорт">
      <div className="preflight">
        <div className="preflight-title">{errors.length || warnings.length
          ? <><Icon name="warning" className="ui-icon preflight-warning" />Перед публикацией: {[errors.length && plural(errors.length, ["ошибка", "ошибки", "ошибок"]), warnings.length && plural(warnings.length, ["предупреждение", "предупреждения", "предупреждений"])].filter(Boolean).join(", ")}</>
          : <><Icon name="check" className="ui-icon preflight-ok" />Проверка пройдена — проблем не найдено</>}</div>
        {shown.map((item, index) => <button key={`${item.code}-${item.span.start}-${index}`} className="preflight-row" onClick={() => { setOpen(false); onNavigate(item); }}>
          <span className={`severity-dot ${item.severity}`} /><span className="preflight-message">{item.message}</span><span className="preflight-position">{item.line}:{item.column}</span>
        </button>)}
        {errors.length + warnings.length > shown.length && <p className="preflight-more">и ещё {errors.length + warnings.length - shown.length}…</p>}
      </div>
      <div className="export-actions">{actions.map((action) => <button key={action.id} disabled={action.disabled} onClick={() => { setOpen(false); action.run(); }}>
        {action.icon && <Icon name={action.icon} />}<span><strong>{action.title}</strong>{action.hint && <small>{action.hint}</small>}</span>
      </button>)}</div>
    </section></>}
  </div>;
}
