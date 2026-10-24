import { useMemo, useState } from "react";
import type { Diagnostic } from "../analysis/types";
import { ruleLabel } from "../bbcode/tags";
import { Icon } from "./Icon";

export interface JournalEntry { id: number; time: number; text: string; kind: "error" | "info" | "change" }
interface Props {
  diagnostics: Diagnostic[];
  journal: JournalEntry[];
  onNavigate(diagnostic: Diagnostic): void;
  onQuickFix(diagnostic: Diagnostic): void;
  canFix(diagnostic: Diagnostic): boolean;
  unambiguous: number;
  onFixAll(): void;
  onClose(): void;
  onClearJournal(): void;
}
type Severity = Diagnostic["severity"];
const severities: Array<[Severity, string]> = [["error", "Ошибки"], ["warning", "Предупреждения"], ["info", "Сведения"]];

/** Bottom tool window: problems grouped by rule, plus a log of what the app did. */
export function ProblemsPanel(props: Props) {
  const [tab, setTab] = useState<"problems" | "journal">("problems");
  const [hidden, setHidden] = useState<Set<Severity>>(new Set()), [filter, setFilter] = useState(""), [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [current, setCurrent] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(severities.map(([severity]) => [severity, props.diagnostics.filter((item) => item.severity === severity).length])) as Record<Severity, number>, [props.diagnostics]);
  const shown = props.diagnostics.filter((item) => !hidden.has(item.severity) && (!filter || `${item.message} ${ruleLabel(item.code)}`.toLowerCase().includes(filter.toLowerCase())));
  const groups = grouped ? [...shown.reduce((map, item) => map.set(item.code, [...(map.get(item.code) ?? []), item]), new Map<string, Diagnostic[]>())] : [["", shown] as [string, Diagnostic[]]];
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  const key = (item: Diagnostic) => `${item.code}-${item.span.start}-${item.span.end}`;
  return <section className="diagnostics problems-panel island" aria-label="Проблемы">
    <div className="diagnostics-header panel-tabs">
      <button className={`panel-tab ${tab === "problems" ? "active" : ""}`} aria-pressed={tab === "problems"} onClick={() => setTab("problems")}><h2>Проблемы</h2><span className="count-badge">{props.diagnostics.length}</span></button>
      <button className={`panel-tab ${tab === "journal" ? "active" : ""}`} aria-pressed={tab === "journal"} onClick={() => setTab("journal")}>Журнал{props.journal.length > 0 && <span className="count-badge">{props.journal.length}</span>}</button>
      {tab === "problems" && <>
        <span className="toolbar-divider" />
        {severities.filter(([severity]) => severity !== "info" || counts.info > 0).map(([severity, title]) => <button key={severity} className={`severity-chip ${severity}`} aria-pressed={!hidden.has(severity)} title={`${hidden.has(severity) ? "Показать" : "Скрыть"}: ${title.toLowerCase()}`} onClick={() => setHidden(toggle(hidden, severity))}><span className={`severity-dot ${severity}`} />{counts[severity]}</button>)}
        <label className="panel-filter"><Icon name="filter" /><input aria-label="Фильтр проблем" placeholder="Фильтр проблем" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <span className="spacer" />
        <button className="text-button group-toggle" aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>Группировать: {grouped ? "по правилу" : "нет"}</button>
        <button className="secondary-button fix-all" aria-label={`Исправить однозначные (${props.unambiguous})`} title="Исправить однозначные ошибки" disabled={!props.unambiguous} onClick={props.onFixAll}><span>Исправить<span className="fix-all-scope"> однозначные</span> ({props.unambiguous})</span></button>
      </>}
      {tab === "journal" && <><span className="spacer" /><button className="text-button" disabled={!props.journal.length} onClick={props.onClearJournal}>Очистить</button></>}
      <button className="icon-button panel-close" aria-label="Скрыть проблемы" onClick={props.onClose}><Icon name="close" /></button>
    </div>
    {tab === "problems" ? <div className="diagnostic-list" role="list">
      {props.diagnostics.length === 0 && <p className="panel-empty"><Icon name="check" />Ошибок не найдено</p>}
      {props.diagnostics.length > 0 && shown.length === 0 && <p className="panel-empty">Нет проблем, подходящих под фильтр</p>}
      {groups.map(([code, items]) => <div className="problem-group" key={code || "all"}>
        {grouped && <button className="problem-group-header" aria-expanded={!collapsed.has(code)} onClick={() => setCollapsed(toggle(collapsed, code))}><Icon name={collapsed.has(code) ? "chevronRight" : "chevronDown"} /><code>{ruleLabel(code)}</code><span>{items.length}</span></button>}
        {!collapsed.has(code) && items.map((item) => <div role="listitem" className={`diagnostic-row ${current === key(item) ? "current" : ""} ${grouped ? "grouped" : ""}`} key={key(item)}>
          <button className={`diagnostic ${item.severity}`} onClick={() => { setCurrent(key(item)); props.onNavigate(item); }} onDoubleClick={() => { props.onNavigate(item); if (props.canFix(item)) props.onQuickFix(item); }}>
            <span className={`severity-dot ${item.severity}`} aria-label={item.severity === "error" ? "Ошибка" : item.severity === "warning" ? "Предупреждение" : "Информация"} />
            <span className="diagnostic-message">{item.message}</span>
            {!grouped && <code className="rule-chip">{ruleLabel(item.code)}</code>}
          </button>
          {props.canFix(item) && <button className="fix-button" onClick={() => { props.onNavigate(item); props.onQuickFix(item); }}>Исправить…</button>}
          <span className="diagnostic-position">{item.line}:{item.column}</span>
        </div>)}
      </div>)}
    </div> : <div className="journal-list" role="log" aria-label="Журнал">
      {props.journal.length === 0 && <p className="panel-empty">Здесь появятся применённые исправления и сообщения об ошибках</p>}
      {[...props.journal].reverse().map((entry) => <div className={`journal-row ${entry.kind}`} key={entry.id}><time>{new Date(entry.time).toLocaleTimeString("ru-RU")}</time><span>{entry.text}</span></div>)}
    </div>}
  </section>;
}
