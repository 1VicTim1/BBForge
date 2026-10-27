import { Fragment, type ReactNode } from "react";
import type { DocumentState } from "../document/state";
import { PluginItemView, uiAttributes, useSlot } from "../plugins/context";
import type { SlotEntry } from "../plugins/ui";

interface Props {
  document: DocumentState; position: number;
  errors: number; warnings: number; synced: boolean;
  /** Drag-and-drop hint ("Переместить внутрь «…», после «…»"), shown instead of the sync state. */
  hint?: string | null;
  /** Name of the active forum profile. */
  profile?: string;
  /** The profile was picked from the document. */
  automaticProfile?: boolean;
  onProblems(): void; onGoToLine(): void;
}
type Render = (entry: SlotEntry<Render>) => ReactNode;
const draw = (entries: SlotEntry<Render>[]) => entries.map((entry) => <Fragment key={entry.id}>{entry.builtin ? entry.builtin(entry) : <PluginItemView entry={entry} variant="status" />}</Fragment>);

export function StatusBar({ document, position, errors, warnings, synced, hint, profile = "4PDA", automaticProfile = false, onProblems, onGoToLine }: Props) {
  const prefix = document.text.slice(0, position), line = (prefix.match(/\n/g)?.length ?? 0) + 1, column = Array.from(prefix.slice(prefix.lastIndexOf("\n") + 1)).length + 1;
  const kinds = new Set(document.endings), endings = kinds.size > 1 ? "LF / CRLF" : document.endings[0] === "crlf" ? "CRLF" : "LF";
  const left = useSlot<Render>("statusbar.left", [
    { id: "status.problems", value: (entry) => <button {...uiAttributes(entry, "status-item status-counts")} title={entry.tooltip ?? "Показать проблемы"} aria-label={`Ошибки: ${errors}, предупреждения: ${warnings}`} onClick={onProblems}>
      <span className="status-count"><span className="severity-dot error" />{errors}</span><span className="status-count"><span className="severity-dot warning" />{warnings}</span>
    </button> },
    { id: "status.sync", value: (entry) => hint ? <span {...uiAttributes(entry, "status-item status-hint")} role="status">{hint}</span>
      : <span {...uiAttributes(entry, `status-item ${synced ? "status-ok" : "status-pending"}`)} role="status">{synced ? "Синхронизировано" : "Синхронизация…"}</span> },
  ]);
  const right = useSlot<Render>("statusbar.right", [
    { id: "status.position", value: (entry) => <button {...uiAttributes(entry, "status-item")} title={entry.tooltip ?? "Перейти к строке"} onClick={onGoToLine}>Стр {line}, Ст {column}</button> },
    { id: "status.endings", value: (entry) => <span {...uiAttributes(entry, "status-item")} title="Переводы строк">{endings}</span> },
    { id: "status.encoding", value: (entry) => <span {...uiAttributes(entry, "status-item")} title="Кодировка">UTF-8{document.bom ? " BOM" : ""}</span> },
    { id: "status.language", value: (entry) => <span {...uiAttributes(entry, "status-item")} title="Язык документа">{entry.title ?? "BBCode"}</span> },
    { id: "status.profile", value: (entry) => <span {...uiAttributes(entry, "status-item profile-badge")} title={`Профиль разметки: ${profile}${automaticProfile ? " (определён по документу)" : ""}`}>{entry.title ?? profile}{automaticProfile && <span className="profile-auto"> · авто</span>}</span> },
  ]);
  return <footer className="statusbar" data-ui-id="statusbar">
    {draw(left)}
    <span className="spacer" />
    {draw(right)}
  </footer>;
}
