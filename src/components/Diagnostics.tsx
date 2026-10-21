import type { Diagnostic, Span } from "../analysis/types";

export function Diagnostics({ diagnostics, onNavigate }: { diagnostics: Diagnostic[]; onNavigate(span: Span): void }) {
  if (diagnostics.length === 0) return <p>Ошибок не найдено</p>;
  return <div className="diagnostic-list">{diagnostics.map((item, index) =>
    <button className={`diagnostic ${item.severity}`} key={`${item.code}-${item.span.start}-${index}`} onClick={() => onNavigate(item.span)}>
      <span>{item.line}:{item.column}</span> {item.message}
    </button>)}</div>;
}
