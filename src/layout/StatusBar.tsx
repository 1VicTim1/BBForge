import type { DocumentState } from "../document/state";
export function StatusBar({ document, position, problems }: { document: DocumentState; position: number; problems: number }) {
  const prefix = document.text.slice(0, position), line = (prefix.match(/\n/g)?.length ?? 0) + 1, column = Array.from(prefix.slice(prefix.lastIndexOf("\n") + 1)).length + 1;
  const kinds = new Set(document.endings), endings = kinds.size > 1 ? "LF / CRLF" : document.endings[0] === "crlf" ? "CRLF" : "LF";
  return <footer className="statusbar"><span className={problems ? "status-warning" : "status-ok"}>{problems ? `◉ ${problems} проблем` : "✓ Разметка в порядке"}</span><span className="spacer" /><span>{line}:{column}</span><span>{endings}</span><span>UTF-8{document.bom ? " BOM" : ""}</span><span className="profile-badge">4PDA</span></footer>;
}
