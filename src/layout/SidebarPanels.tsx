import { useMemo, useState } from "react";
import type { SourceRange } from "../document/commands";
import { plural } from "../bbcode/tags";
import { Icon, type IconName } from "../components/Icon";

/** Find in the document: every match with its line, click jumps to it in the code. */
export function SearchPanel({ text, onNavigate }: { text: string; onNavigate(range: SourceRange): void }) {
  const [query, setQuery] = useState(""), [caseSensitive, setCaseSensitive] = useState(false), [tagsOnly, setTagsOnly] = useState(false);
  const results = useMemo(() => {
    if (!query) return [];
    const haystack = caseSensitive ? text : text.toLowerCase(), needle = caseSensitive ? query : query.toLowerCase(), found: Array<{ from: number; line: number; before: string; match: string; after: string }> = [];
    let line = 1, lineStart = 0, scanned = 0;
    for (let at = haystack.indexOf(needle); at >= 0 && found.length < 500; at = haystack.indexOf(needle, at + Math.max(1, needle.length))) {
      for (; scanned < at; scanned++) if (text[scanned] === "\n") { line++; lineStart = scanned + 1; }
      if (tagsOnly) { const open = text.lastIndexOf("[", at), close = text.lastIndexOf("]", at); if (open < 0 || close > open) continue; }
      const lineEnd = text.indexOf("\n", at), end = lineEnd < 0 ? text.length : lineEnd, from = Math.max(lineStart, at - 24);
      found.push({ from: at, line, before: (from > lineStart ? "…" : "") + text.slice(from, at), match: text.slice(at, at + query.length), after: text.slice(at + query.length, Math.min(end, at + query.length + 60)) });
    }
    return found;
  }, [text, query, caseSensitive, tagsOnly]);
  return <div className="search-panel">
    <label className="panel-filter"><Icon name="search" /><input autoFocus aria-label="Найти в документе" placeholder="Найти в документе" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) onNavigate({ from: results[0].from, to: results[0].from + query.length }); }} /></label>
    <div className="search-options">
      <button className={`text-button ${caseSensitive ? "active" : ""}`} aria-pressed={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)} title={caseSensitive ? "Регистр учитывается — нажмите, чтобы искать без учёта регистра" : "Учитывать регистр"}>Aa</button>
      <button className={`text-button ${tagsOnly ? "active" : ""}`} aria-pressed={tagsOnly} onClick={() => setTagsOnly(!tagsOnly)} title={tagsOnly ? "Ищутся только совпадения внутри [тегов]" : "Искать только внутри тегов"}>[ ] только теги</button>
    </div>
    {query && <p className="search-summary">{results.length ? plural(results.length, ["совпадение", "совпадения", "совпадений"]) + (results.length >= 500 ? "+" : "") : "Ничего не найдено"}</p>}
    <div className="search-results" role="list">{results.map((item) => <button role="listitem" key={item.from} className="search-result" onClick={() => onNavigate({ from: item.from, to: item.from + query.length })}>
      <span>{item.line}</span><span>{item.before}<mark>{item.match}</mark>{item.after}</span>
    </button>)}</div>
  </div>;
}

interface BlockAction { id: string; title: string; description: string; icon: IconName; tag: string; run(): void; disabled?: boolean }
/** Insertable blocks: each wraps the selection (or inserts at the cursor) like the toolbar does. */
export function BlocksPanel({ actions }: { actions: BlockAction[] }) {
  return <div className="blocks-panel"><div className="blocks-list">{actions.map((action) => <button key={action.id} className="block-tile" disabled={action.disabled} onClick={action.run}>
    <span className="tile-icon"><Icon name={action.icon} /></span><span><strong>{action.title}</strong><small>{action.description}</small><code>{action.tag}</code></span>
  </button>)}</div></div>;
}
