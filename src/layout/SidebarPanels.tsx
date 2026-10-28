import { useEffect, useMemo, useState } from "react";
import type { SourceRange } from "../document/commands";
import { plural } from "../bbcode/tags";
import { Icon, type IconName } from "../components/Icon";
import { PluginIcon, PluginItemView, uiAttributes, useSlot } from "../plugins/context";

export type SearchScope = "all" | "text" | "tags";
export interface SearchMatch { from: number; to: number; line: number; before: string; match: string; after: string; replacement: string }
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Matches of `query` in `text`. `segments` are the text parts between tags (from the analysis):
 * scope "text" searches only them, "tags" only what lies between them, "all" everything.
 * Replacements follow String.replace ($1, $&…) for regular expressions.
 */
export function findMatches(text: string, query: string, options: { regex: boolean; caseSensitive: boolean; scope: SearchScope; replacement: string }, segments: Array<{ from: number; to: number }> | null, limit = 2000): { matches: SearchMatch[]; error: string | null } {
  if (!query) return { matches: [], error: null };
  let pattern: RegExp;
  try { pattern = new RegExp(options.regex ? query : escapeRegExp(query), `gu${options.caseSensitive ? "" : "i"}`); }
  catch (error) { return { matches: [], error: `Ошибка в выражении: ${(error as Error).message}` }; }
  const single = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const textParts = segments ?? [{ from: 0, to: text.length }];
  const scopes = options.scope === "text" ? textParts : options.scope === "tags" && segments
    ? segments.reduce<Array<{ from: number; to: number }>>((gaps, segment, at) => { const start = at === 0 ? 0 : segments[at - 1].to; if (segment.from > start) gaps.push({ from: start, to: segment.from }); if (at === segments.length - 1 && segment.to < text.length) gaps.push({ from: segment.to, to: text.length }); return gaps; }, segments.length ? [] : [{ from: 0, to: text.length }])
    : [{ from: 0, to: text.length }];
  const matches: SearchMatch[] = [];
  for (const scope of scopes) {
    const part = text.slice(scope.from, scope.to);
    pattern.lastIndex = 0;
    for (let found = pattern.exec(part); found && matches.length < limit; found = pattern.exec(part)) {
      if (!found[0]) { pattern.lastIndex++; continue; }
      const from = scope.from + found.index, to = from + found[0].length;
      const lineStart = text.lastIndexOf("\n", from - 1) + 1, lineEnd = text.indexOf("\n", to), end = lineEnd < 0 ? text.length : lineEnd, start = Math.max(lineStart, from - 24);
      matches.push({ from, to, line: (text.slice(0, from).match(/\n/g)?.length ?? 0) + 1, before: (start > lineStart ? "…" : "") + text.slice(start, from), match: found[0], after: text.slice(to, Math.min(end, to + 60)), replacement: options.regex ? found[0].replace(single, options.replacement) : options.replacement });
    }
  }
  matches.sort((a, b) => a.from - b.from);
  return { matches, error: null };
}

/** Find and replace in the document: by default only in text, never inside tags. */
export function SearchPanel({ text, segments, replaceMode = false, onNavigate, onReplace }: { text: string; segments: Array<{ from: number; to: number }> | null; replaceMode?: boolean; onNavigate(range: SourceRange): void; onReplace?(changes: Array<{ from: number; to: number; insert: string }>, label: string): void }) {
  const [query, setQuery] = useState(""), [replacement, setReplacement] = useState(""), [caseSensitive, setCaseSensitive] = useState(false), [regex, setRegex] = useState(false), [scope, setScope] = useState<SearchScope>("text"), [replacing, setReplacing] = useState(replaceMode);
  useEffect(() => { if (replaceMode) setReplacing(true); }, [replaceMode]);
  const { matches, error } = useMemo(() => findMatches(text, query, { regex, caseSensitive, scope, replacement }, segments), [text, query, regex, caseSensitive, scope, replacement, segments]);
  const replace = (items: SearchMatch[]) => onReplace?.(items.map((item) => ({ from: item.from, to: item.to, insert: item.replacement })), items.length === 1 ? "Заменить" : `Заменить все (${items.length})`);
  const scopes: Array<[SearchScope, string, string]> = [["text", "текст", "Только текст: теги и их значения не меняются"], ["all", "везде", "Текст и теги"], ["tags", "[ ] теги", "Только внутри [тегов]"]];
  return <div className="search-panel">
    <label className="panel-filter"><Icon name="search" /><input autoFocus aria-label="Найти в документе" placeholder={regex ? "Регулярное выражение" : "Найти в документе"} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) onNavigate({ from: matches[0].from, to: matches[0].to }); }} /></label>
    {replacing && <label className="panel-filter"><Icon name="wand" /><input autoFocus={replaceMode} aria-label="Заменить на" placeholder={regex ? "Заменить на ($1 — группа)" : "Заменить на"} value={replacement} onChange={(event) => setReplacement(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && matches.length) replace(matches); }} /></label>}
    <div className="search-options">
      <button className={`text-button ${caseSensitive ? "active" : ""}`} aria-pressed={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)} title="Учитывать регистр">Aa</button>
      <button className={`text-button ${regex ? "active" : ""}`} aria-pressed={regex} onClick={() => setRegex(!regex)} title="Регулярное выражение">.*</button>
      <span className="search-scope" role="group" aria-label="Где искать">{scopes.map(([value, label, title]) => <button key={value} className={`text-button ${scope === value ? "active" : ""}`} aria-pressed={scope === value} title={title} disabled={value !== "all" && !segments} onClick={() => setScope(value)}>{label}</button>)}</span>
      <span className="spacer" />
      {onReplace && <button className={`text-button ${replacing ? "active" : ""}`} aria-pressed={replacing} title="Заменить (Ctrl+H)" onClick={() => setReplacing(!replacing)}>Замена</button>}
    </div>
    {error && <p className="search-summary search-error" role="alert">{error}</p>}
    {query && !error && <p className="search-summary">{matches.length ? plural(matches.length, ["совпадение", "совпадения", "совпадений"]) + (matches.length >= 2000 ? "+" : "") : "Ничего не найдено"}
      {replacing && matches.length > 0 && <button className="secondary-button replace-all" onClick={() => replace(matches)}>Заменить все</button>}</p>}
    <div className="search-results" role="list">{matches.map((item) => <div role="listitem" key={item.from} className="search-result-row">
      <button className="search-result" onClick={() => onNavigate({ from: item.from, to: item.to })}>
        <span>{item.line}</span><span>{item.before}<mark className={replacing ? "replaced" : undefined}>{item.match}</mark>{replacing && <ins>{item.replacement}</ins>}{item.after}</span>
      </button>
      {replacing && <button className="text-button replace-one" title="Заменить это совпадение" onClick={() => replace([item])}>Заменить</button>}
    </div>)}</div>
  </div>;
}

interface BlockAction { id: string; title: string; description: string; icon: IconName; tag: string; run(): void; disabled?: boolean }
/** Insertable blocks: each wraps the selection (or inserts at the cursor) like the toolbar does. */
export function BlocksPanel({ actions }: { actions: BlockAction[] }) {
  const entries = useSlot("sidebar.blocks", actions.map((action) => ({ id: `block.${action.id}`, value: action })));
  return <div className="blocks-panel"><div className="blocks-list" data-ui-id="sidebar.blocks">{entries.map((entry) => { const action = entry.builtin; return action ? <button key={entry.id} {...uiAttributes(entry, "block-tile")} disabled={action.disabled} onClick={action.run}>
    <span className="tile-icon">{entry.icon ? <PluginIcon icon={entry.icon} owner={entry.owner} /> : <Icon name={action.icon} />}</span><span><strong>{entry.title ?? action.title}</strong><small>{entry.tooltip ?? action.description}</small><code>{action.tag}</code></span>
  </button> : <PluginItemView key={entry.id} entry={entry} variant="tile" />; })}</div></div>;
}
