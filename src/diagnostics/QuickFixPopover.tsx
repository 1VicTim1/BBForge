import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Diagnostic } from "../analysis/types";
import { ruleLabel, SAFE_COLOR, plural } from "../bbcode/tags";
import { validateCommand, type EditCommand } from "../document/commands";
import type { DocumentState } from "../document/state";
import { safeExternalUrl } from "../components/Preview";
import { lineDiff } from "./diff";
import type { FixSuggestion } from "./fixes";

interface Props {
  document: DocumentState;
  diagnostic: Diagnostic | null;
  title?: string;
  fixes: FixSuggestion[];
  anchor: { x: number; y: number };
  onApply(command: EditCommand): void;
  /** Ctrl+Enter: the same fix for every problem of this rule; returns how many places it would change. */
  sameEverywhere?(fix: FixSuggestion): { count: number; apply(): void } | null;
  onClose(): void;
}

function withParameter(fix: FixSuggestion, parameter: string): EditCommand {
  return { ...fix.command, changes: fix.command.changes.map((change) => ({ ...change, insert: fix.needsParameter ? change.insert.replace("$VALUE", () => parameter) : change.insert })) };
}
function parameterError(kind: FixSuggestion["needsParameter"], value: string): string | null {
  if (!kind) return null;
  if (!value.trim()) return "Введите значение";
  if (/[\]\r\n]/.test(value)) return "Параметр содержит недопустимые символы";
  if (kind === "url" && !safeExternalUrl(value)) return "Введите http, https или mailto ссылку";
  if (kind === "color" && !SAFE_COLOR.test(value)) return "Некорректный цвет";
  if (kind === "size" && !/^\d{1,2}$/.test(value)) return "Размер — целое число от 1 до 99";
  if (kind === "font" && !/^[\w -]{1,40}$/.test(value)) return "Некорректное название шрифта";
  return null;
}
const parameterLabels: Record<NonNullable<FixSuggestion["needsParameter"]>, string> = { url: "Адрес ссылки", color: "Цвет", title: "Заголовок", size: "Размер", font: "Шрифт" };

/** Alt+Enter: fixes for the problem at the cursor, the preferred one first, with a mini diff. */
export function QuickFixPopover({ document, diagnostic, title, fixes, anchor, onApply, sameEverywhere, onClose }: Props) {
  const [active, setActive] = useState(0), [parameter, setParameter] = useState(""), [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), [position, setPosition] = useState(anchor);
  const fix = fixes[Math.min(active, fixes.length - 1)];
  let stale = false, command: EditCommand | null = null, diff: ReturnType<typeof lineDiff> = [];
  try { command = withParameter(fix, parameter || (fix.needsParameter ? "…" : "")); validateCommand(document, command); diff = lineDiff(document, command.changes); } catch { stale = true; }
  const everywhere = sameEverywhere?.(fix) ?? null;
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect(); if (!box) return;
    const below = anchor.y + 6, top = below + box.height > window.innerHeight - 8 ? Math.max(8, anchor.y - box.height - 26) : below;
    setPosition({ x: Math.max(8, Math.min(anchor.x - 12, window.innerWidth - box.width - 8)), y: top });
  }, [anchor.x, anchor.y, fixes.length]);
  useLayoutEffect(() => { root.current?.querySelector<HTMLElement>(fix?.needsParameter ? "input" : "[role=listbox]")?.focus(); }, [active]);
  const apply = (all = false) => {
    if (all && everywhere) { everywhere.apply(); return; }
    const problem = parameterError(fix.needsParameter, parameter);
    if (problem) { setError(problem); root.current?.querySelector("input")?.focus(); return; }
    if (!stale) onApply(withParameter(fix, parameter));
  };
  const key = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + fixes.length) % fixes.length); setParameter(""); setError(""); }
    else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); apply(event.ctrlKey || event.metaKey); }
  };
  // Keys work even if focus moved elsewhere (navigating to the problem focuses the code editor).
  const keyRef = useRef(key); keyRef.current = key;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(event.key) || root.current?.querySelector("input") === globalThis.document.activeElement && event.key !== "Escape" && event.key !== "Enter") return;
      keyRef.current(event as unknown as React.KeyboardEvent);
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
  return <><div className="popover-dismiss" onPointerDown={onClose} />
    <div ref={root} className="quickfix popover" role="dialog" aria-label="Исправления" style={{ left: position.x, top: position.y }}>
      <div className="quickfix-head">
        {diagnostic && <span className={`severity-dot ${diagnostic.severity}`} />}
        <span className="quickfix-message">{diagnostic?.message ?? title}</span>
        {diagnostic && <code className="quickfix-rule">{ruleLabel(diagnostic.code)}</code>}
      </div>
      <div className="quickfix-list" role="listbox" tabIndex={-1} aria-label="Варианты исправления" aria-activedescendant={`quickfix-${active}`}>
        {fixes.map((item, index) => <div key={item.id} id={`quickfix-${index}`} role="option" aria-selected={index === active} className={`quickfix-option ${index === active ? "active" : ""}`} onMouseEnter={() => { if (index !== active) { setActive(index); setParameter(""); setError(""); } }} onClick={() => { setActive(index); if (!item.needsParameter) onApply(withParameter(item, "")); }}>
          <span className="quickfix-star" aria-hidden="true">{index === 0 ? "★" : ""}</span>
          <span className="quickfix-title">{item.title}{item.needsParameter ? "…" : ""}</span>
          {item.impact && <span className={`fix-impact ${item.impact.startsWith("добавит") ? "worse" : item.impact.startsWith("устраняет") ? "better" : ""}`}>{item.impact}</span>}
          {index === active && <kbd>Enter</kbd>}
        </div>)}
      </div>
      {fix.needsParameter && <label className="quickfix-parameter">{parameterLabels[fix.needsParameter]}<input aria-label="Значение параметра" value={parameter} placeholder={fix.needsParameter === "url" ? "https://" : fix.needsParameter === "color" ? "#RRGGBB или red" : ""} onChange={(event) => { setParameter(event.target.value); setError(""); }} /></label>}
      {(error || stale) && <p className="quickfix-error" role="alert">{stale ? "Документ изменился. Откройте исправления заново." : error}</p>}
      {diff.length > 0 && <div className="mini-diff" aria-label="Изменения">{diff.map((line, index) => <div key={index} className={`diff-line ${line.kind}`}><span className="diff-sign">{line.kind === "removed" ? "−" : line.kind === "added" ? "+" : ""}</span><span className="diff-text">{line.text || (line.kind === "added" ? <em>строка удаляется</em> : " ")}</span></div>)}</div>}
      <div className="quickfix-hints"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> применить</span>{everywhere && everywhere.count > 1 && <button className="text-button" onClick={() => everywhere.apply()}><kbd>Ctrl</kbd><kbd>Enter</kbd> все такие же ({plural(everywhere.count, ["место", "места", "мест"])})</button>}<span className="spacer" /><span><kbd>Esc</kbd></span></div>
    </div>
  </>;
}
