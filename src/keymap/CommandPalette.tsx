import { Command as Cmdk } from "cmdk";
import { useMemo, useState, type ReactNode } from "react";
import { scopeTitles, type Command, type RefactorScope } from "../commands/registry";
import { plural, tagRole } from "../bbcode/tags";
import { Icon } from "../components/Icon";
import { PluginIcon } from "../plugins/context";
import type { Span } from "../analysis/types";

export interface PaletteFile { id: string; title: string; detail: string; active: boolean }
export interface PaletteTag { key: string; tag: string; label: string; line: number; span: Span }
interface Props {
  initial: string;
  commands: Command[];
  files: PaletteFile[];
  tags: PaletteTag[];
  lineCount: number;
  scopes: RefactorScope[];
  onCommand(command: Command, scope: RefactorScope): void;
  onFile(id: string): void;
  onTag(span: Span): void;
  onLine(line: number): void;
  onClose(): void;
}

/** Highlights each query word inside a title. */
function highlight(text: string, words: string[]): ReactNode {
  if (!words.length) return text;
  const lower = text.toLowerCase(), marks: Array<[number, number]> = [];
  for (const word of words) { const at = lower.indexOf(word); if (at >= 0) marks.push([at, at + word.length]); }
  marks.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = []; let cursor = 0;
  for (const [from, to] of marks) { if (from < cursor) continue; parts.push(text.slice(cursor, from), <mark key={from}>{text.slice(from, to)}</mark>); cursor = to; }
  parts.push(text.slice(cursor));
  return parts;
}
const count = (value: number | null | undefined) => value === null || value === undefined ? null : value === 0 ? "нечего" : plural(value, ["место", "места", "мест"]);

/**
 * Ctrl+Shift+P. Prefixes: ">" commands, "@" tags of the document, ":" line number, no prefix — open files.
 * Tab switches the scope (document / selection / current spoiler) of the highlighted refactoring.
 */
export function CommandPalette(props: Props) {
  const [query, setQuery] = useState(props.initial), [selected, setSelected] = useState("");
  const [scopes, setScopes] = useState<Record<string, RefactorScope>>({});
  const mode = query.startsWith(">") ? "commands" : query.startsWith("@") ? "tags" : query.startsWith(":") ? "line" : "files";
  const words = query.replace(/^[>@:]/, "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scopeOf = (command: Command): RefactorScope => scopes[command.id] && props.scopes.includes(scopes[command.id]) ? scopes[command.id] : "document";
  const commands = useMemo(() => props.commands.filter((command) => !command.hidden && words.every((word) => `${command.title} ${command.category}`.toLowerCase().includes(word))), [props.commands, words.join(" ")]);
  const categories = [...new Set(commands.map((command) => command.category))];
  const files = props.files.filter((file) => words.every((word) => `${file.title} ${file.detail}`.toLowerCase().includes(word)));
  const tags = props.tags.filter((item) => words.every((word) => `${item.tag} ${item.label}`.toLowerCase().includes(word))).slice(0, 200);
  const line = Number(query.slice(1).trim());
  const cycle = (command: Command) => { const at = props.scopes.indexOf(scopeOf(command)); setScopes({ ...scopes, [command.id]: props.scopes[(at + 1) % props.scopes.length] }); };
  const placeholder = mode === "commands" ? "Введите команду…" : mode === "tags" ? "Тег или заголовок блока…" : mode === "line" ? `Номер строки (1–${props.lineCount})` : "Имя открытого файла · > команды · @ теги · : строка";
  return <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section className="palette" role="dialog" aria-label="Палитра команд">
      <Cmdk label="Палитра команд" shouldFilter={false} loop value={selected} onValueChange={setSelected} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); }
        if (event.key === "Tab" && mode === "commands") { const command = commands.find((item) => item.id === selected); event.preventDefault(); if (command?.scoped) cycle(command); }
      }}>
        <div className="palette-input-row">
          <Cmdk.Input autoFocus aria-label="Команда, файл, тег или строка" placeholder={placeholder} value={query} onValueChange={setQuery} />
          <span className="palette-mode">{mode === "commands" ? "Команды" : mode === "tags" ? "Теги документа" : mode === "line" ? "Строка" : "Файлы"}</span>
        </div>
        <Cmdk.List>
          <Cmdk.Empty>Ничего не найдено</Cmdk.Empty>
          {mode === "commands" && categories.map((category) => <Cmdk.Group key={category} heading={category}>
            {commands.filter((command) => command.category === category).map((command) => {
              const scope = scopeOf(command), places = count(command.count?.(scope));
              return <Cmdk.Item key={command.id} value={command.id} disabled={command.enabled === false} onSelect={() => props.onCommand(command, scope)}>
                {command.icon && <PluginIcon icon={command.icon} owner={command.owner} />}
                <span className="palette-title">{highlight(command.title, words)}</span>
                {command.scoped && <button className="scope-chip" tabIndex={-1} title="Область действия (Tab)" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); cycle(command); }}>{scopeTitles[scope]} ▾</button>}
                {places && <span className={`palette-count ${places === "нечего" ? "none" : ""}`}>{places}</span>}
                {command.keys?.[0] && <kbd>{command.keys[0]}</kbd>}
              </Cmdk.Item>;
            })}
          </Cmdk.Group>)}
          {mode === "files" && <Cmdk.Group heading="Открытые файлы">
            {files.map((file) => <Cmdk.Item key={file.id} value={`file:${file.id}`} onSelect={() => props.onFile(file.id)}><Icon name="file" /><span className="palette-title">{highlight(file.title, words)}</span><span className="palette-detail">{file.active ? "текущий" : file.detail}</span></Cmdk.Item>)}
          </Cmdk.Group>}
          {mode === "tags" && <Cmdk.Group heading="Документ">
            {tags.map((item) => <Cmdk.Item key={item.key} value={`tag:${item.key}`} onSelect={() => props.onTag(item.span)}><span className={`tag-name role-${tagRole(item.tag)}`}>{item.tag}</span><span className="palette-title">{highlight(item.label, words)}</span><span className="palette-detail">строка {item.line}</span></Cmdk.Item>)}
          </Cmdk.Group>}
          {mode === "line" && Number.isInteger(line) && line >= 1 && line <= props.lineCount && <Cmdk.Group heading="Перейти">
            <Cmdk.Item value={`line:${line}`} onSelect={() => props.onLine(line)}><span className="palette-title">Перейти к строке {line}</span></Cmdk.Item>
          </Cmdk.Group>}
        </Cmdk.List>
        <div className="palette-footer"><span>&gt; команды</span><span>@ теги документа</span><span>: строка</span><span className="spacer" />{mode === "commands" && <span>Tab — область</span>}<span>Enter — выполнить</span><span>Esc — закрыть</span></div>
      </Cmdk>
    </section>
  </div>;
}
