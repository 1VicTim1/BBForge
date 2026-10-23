import type { Diagnostic, Span } from "../analysis/types";

export function Diagnostics({ diagnostics, onNavigate, onFix, canFix }: { diagnostics: Diagnostic[]; onNavigate(span: Span): void; onFix?(diagnostic: Diagnostic): void; canFix?(diagnostic: Diagnostic): boolean }) {
  if (diagnostics.length === 0) return <p>Ошибок не найдено</p>;
  return <div className="diagnostic-list">{diagnostics.map((item, index) =>
    <div className="diagnostic-row" key={`${item.code}-${item.span.start}-${index}`}><button className={`diagnostic ${item.severity}`} onClick={() => onNavigate(item.span)}>
      <span className="diagnostic-icon" aria-label={item.severity === "error" ? "Ошибка" : item.severity === "warning" ? "Предупреждение" : "Информация"}>{item.severity === "error" ? "✕" : item.severity === "warning" ? "!" : "i"}</span><span>{item.line}:{item.column}</span> {item.message}
    </button>{onFix && (canFix?.(item) ?? true) && <button className="fix-button" onClick={() => onFix(item)}>Исправить…</button>}</div>)}</div>;
}
