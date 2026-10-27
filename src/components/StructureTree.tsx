import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic, Node, Span } from "../analysis/types";
import type { NodeRef } from "../document/structure";
import type { DocumentIdentity } from "../document/commands";
import { createPositionIndex, type PositionIndex } from "../document/positions";
import { isKnownTag, plural, tagRole } from "../bbcode/tags";
import { builtinOf, tagSpec } from "../bbcode/profile";
import { hostAndPath, nodeLabel } from "../bbcode/labels";
import { EdgeAutoScroller } from "../drag/edgeAutoScroll";
import { Icon } from "./Icon";

export type TreeMode = "outline" | "all";
type Placement = "before" | "inside" | "after";
export interface StructureTreeProps {
  nodes: Node[];
  source: string;
  onNavigate(span: Span): void;
  identity?: DocumentIdentity;
  diagnostics?: Diagnostic[];
  selected?: Span;
  /** UTF-16 offset of the cursor; with "follow cursor" the tree reveals the block under it. */
  cursor?: number;
  onMove?(source: NodeRef, target: Span, placement: Placement): void;
  /** Status-bar hint while dragging ("Переместить внутрь «…», после «…»"); null when the drag ends. */
  onDragHint?(hint: string | null): void;
  mode?: TreeMode;
  /** The analysis is behind the text: rows are shown but cannot be clicked or dropped on. */
  busy?: boolean;
}

interface Row {
  key: string; depth: number; tag: string; label: string; span: Span;
  node: Node | null; parent: Row | null; count: string; expandable: boolean; expanded: boolean;
  errors: number; warnings: number; wellFormed: boolean; children: Row[];
}

const OUTLINE_BUILTINS = new Set<string>(["spoiler", "quote", "code", "list", "*", "size", "img", "attachment", "url"]);
const CONTAINER_BUILTINS = new Set<string>(["spoiler", "quote", "list", "left", "center", "right"]);
/** Structural tags shown in the outline: built-in ones and plain block or media tags of the profile. */
const OUTLINE_TAGS = { has: (name: string) => { const spec = tagSpec(name); return !!spec && (spec.builtin ? OUTLINE_BUILTINS.has(spec.builtin) : spec.role !== "inline"); } };
const CONTAINERS = { has: (name: string) => { const spec = tagSpec(name); return !!spec && (spec.builtin ? CONTAINER_BUILTINS.has(spec.builtin) : spec.role === "block"); } };
/** Builds the visible rows: which tags become nodes, their captions, problem dots and groups of repeats. */
function buildRows(nodes: Node[], source: string, index: PositionIndex, mode: TreeMode, diagnostics: Diagnostic[], expanded: Map<string, boolean>, filter: { tag: string | null; text: string }, collapseDepth: number): Row[] {
  const shown = (node: Node) => node.kind === "element" && (mode === "all" || OUTLINE_TAGS.has(node.name ?? "") || !isKnownTag(node.name) || !node.wellFormed);
  const lifted = (children: Node[]): Node[] => children.flatMap((child) => child.kind !== "element" ? [] : shown(child) ? [child] : lifted(child.children));
  const problems = (span: Span) => {
    let errors = 0, warnings = 0;
    for (const item of diagnostics) if (item.span.start >= span.start && item.span.start < Math.max(span.end, span.start + 1)) { if (item.severity === "error") errors++; else if (item.severity === "warning") warnings++; }
    return { errors, warnings };
  };
  const label = (node: Node) => nodeLabel(node, source, index);
  const matches = (row: Row): boolean => (!filter.tag || row.tag === filter.tag) && (!filter.text || `${row.tag} ${row.label}`.toLowerCase().includes(filter.text));
  const filtering = Boolean(filter.tag || filter.text);
  const build = (children: Node[], depth: number, parent: Row | null): Row[] => {
    const items = lifted(children), rows: Row[] = [];
    for (let at = 0; at < items.length; at++) {
      const node = items[at], name = node.name ?? "";
      let run = 1; while (builtinOf(name) !== "spoiler" && items[at + run]?.name === name && run < 1000) run++;
      if (run >= 3 && mode === "outline" && !filtering) {
        const members = items.slice(at, at + run), key = `g${members[0].span.start}`;
        const hosts = new Set(members.map((member) => builtinOf(name) === "url" ? hostAndPath(member.parameter ?? "").split("/")[0] : ""));
        const span = { start: members[0].span.start, end: members.at(-1)!.span.end };
        const group: Row = { key, depth, tag: name, label: builtinOf(name) === "url" ? `${hosts.size === 1 ? [...hosts][0] : "ссылки"} — ${hosts.size === 1 ? "навигация" : "разные адреса"}` : label(members[0]), span, node: null, parent, count: `×${run}`, expandable: true, expanded: expanded.get(key) ?? false, ...problems(span), wellFormed: true, children: [] };
        group.children = members.map((member) => toRow(member, depth + 1, group));
        rows.push(group); at += run - 1; continue;
      }
      rows.push(toRow(node, depth, parent));
    }
    return filtering ? rows.filter((row) => matches(row) || row.children.length > 0) : rows;
  };
  const toRow = (node: Node, depth: number, parent: Row | null): Row => {
    const key = String(node.span.start), row: Row = { key, depth, tag: node.name ?? "", label: label(node), span: node.span, node, parent, count: "", expandable: false, expanded: false, ...problems(node.span), wellFormed: node.wellFormed, children: [] };
    row.children = build(node.children, depth + 1, row);
    row.expandable = row.children.length > 0;
    row.expanded = filtering || (expanded.get(key) ?? depth < collapseDepth);
    if (CONTAINERS.has(row.tag) && builtinOf(node.name) !== "list") row.count = String(lifted(node.children).length || "");
    return row;
  };
  return build(nodes, 0, null);
}

const flatten = (rows: Row[], out: Row[] = []) => { for (const row of rows) { out.push(row); if (row.expanded) flatten(row.children, out); } return out; };
let dragged: Span | null = null;

export function StructureTree(props: StructureTreeProps) {
  const [mode, setMode] = useState<TreeMode>(props.mode ?? "outline"), [query, setQuery] = useState(""), [follow, setFollow] = useState(false);
  const [expanded, setExpanded] = useState(() => new Map<string, boolean>());
  const [drop, setDrop] = useState<{ key: string; placement: Placement } | null>(null);
  const viewport = useRef<HTMLDivElement>(null), [scroll, setScroll] = useState({ top: 0, height: 600 }), [rowHeight, setRowHeight] = useState(24);
  const index = useMemo(() => createPositionIndex(props.source), [props.source]);
  const filter = useMemo(() => { const tag = /(?:^|\s)tag:(\S+)/i.exec(query)?.[1]?.toLowerCase() ?? null; return { tag, text: query.replace(/(?:^|\s)tag:\S*/i, "").trim().toLowerCase() }; }, [query]);
  const tree = useMemo(() => buildRows(props.nodes, props.source, index, mode, props.diagnostics ?? [], expanded, filter, 2), [props.nodes, props.source, index, mode, props.diagnostics, expanded, filter]);
  const rows = useMemo(() => flatten(tree), [tree]);
  const cursorByte = props.cursor === undefined ? null : index.utf16ToByte(Math.min(props.cursor, props.source.length));
  const current = useMemo(() => {
    if (!follow || cursorByte === null) return null;
    let best: Row | null = null;
    const visit = (items: Row[]) => { for (const row of items) if (row.node && cursorByte >= row.span.start && cursorByte < row.span.end) { best = row; visit(row.children); } else if (!row.node && cursorByte >= row.span.start && cursorByte < row.span.end) visit(row.children); };
    visit(tree); return best as Row | null;
  }, [follow, cursorByte, tree]);
  useEffect(() => {
    if (!current) return;
    const open: string[] = []; for (let row = current.parent; row; row = row.parent) if (!row.expanded) open.push(row.key);
    if (open.length) setExpanded((map) => { const next = new Map(map); open.forEach((key) => next.set(key, true)); return next; });
  }, [current?.key]);
  useLayoutEffect(() => {
    const element = viewport.current; if (!element) return;
    const measured = parseFloat(getComputedStyle(element).getPropertyValue("--h-row")); if (measured) setRowHeight(measured);
    const update = () => setScroll({ top: element.scrollTop, height: element.clientHeight || 600 });
    update(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update); observer?.observe(element);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const target = current ? rows.indexOf(rows.find((row) => row.key === current.key) ?? current) : -1, element = viewport.current;
    if (target < 0 || !element) return;
    const top = target * rowHeight; if (top < element.scrollTop || top + rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = Math.max(0, top - element.clientHeight / 3);
  }, [current?.key, rows.length]);
  const scroller = useMemo(() => new EdgeAutoScroller(), []);
  const toggle = (row: Row) => setExpanded((map) => new Map(map).set(row.key, !row.expanded));
  const first = Math.max(0, Math.floor(scroll.top / rowHeight) - 10), last = Math.min(rows.length, Math.ceil((scroll.top + scroll.height) / rowHeight) + 10);
  const selectedKey = props.selected ? String(props.selected.start) : null;
  const titleOf = (row: Row | null) => `«${row?.label || row?.tag}»`;
  const into = (row: Row | null) => row ? `внутрь ${titleOf(row)}` : "в корень документа";
  const hint = (row: Row, placement: Placement) => placement === "inside" ? `Переместить внутрь ${titleOf(row)}, в конец` : `Переместить ${into(row.parent?.node ? row.parent : row.parent?.parent ?? null)}, ${placement === "before" ? "перед" : "после"} ${titleOf(row)}`;
  const focusRow = (at: number) => requestAnimationFrame(() => viewport.current?.querySelector<HTMLElement>(`[data-row="${at}"] [role=treeitem]`)?.focus());
  return <div className="structure">
    <div className="structure-tools">
      <label className="panel-filter"><Icon name="filter" /><input aria-label="Фильтр структуры" placeholder="Фильтр · tag:url" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button className={`icon-button ${follow ? "active" : ""}`} aria-pressed={follow} title="Следовать за курсором" aria-label="Следовать за курсором" onClick={() => setFollow(!follow)}><Icon name="crosshair" /></button>
    </div>
    <div className="segmented small tree-mode" role="group" aria-label="Вид дерева">
      {(["outline", "all"] as const).map((value) => <button key={value} aria-pressed={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "outline" ? "Outline" : "Все теги"}</button>)}
    </div>
    <div ref={viewport} className="outline-tree" role="tree" aria-busy={props.busy || undefined} aria-label="Структура документа" onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight || 600 })}
      onKeyDown={(event) => {
        const at = Number((event.target as HTMLElement).closest<HTMLElement>("[data-row]")?.dataset.row ?? -1); if (at < 0) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = Math.max(0, Math.min(rows.length - 1, at + (event.key === "ArrowDown" ? 1 : -1))); viewport.current!.scrollTop = Math.min(viewport.current!.scrollTop, next * rowHeight); focusRow(next); }
        else if ((event.key === "ArrowRight" && !rows[at].expanded || event.key === "ArrowLeft" && rows[at].expanded) && rows[at].expandable) { event.preventDefault(); toggle(rows[at]); }
      }}>
      {rows.length === 0 && <p className="panel-empty">{query ? "Ничего не найдено" : props.nodes.length ? "Нет блоков для показа — переключите на «Все теги»" : "Документ пуст"}</p>}
      <div className="outline-rows" style={{ height: rows.length * rowHeight }}>
        {rows.slice(first, last).map((row, offset) => {
          const at = first + offset, droppable = !!props.onMove && !!row.node;
          return <div key={`${row.key}-${row.depth}`} data-row={at} className={`outline-node ${row.node && row.key === selectedKey ? "selected" : ""} ${current?.key === row.key ? "current" : ""}`} style={{ top: at * rowHeight, height: rowHeight }}>
            <div className={`tree-row ${drop?.key === row.key ? `drop-${drop.placement}` : ""}`} style={{ paddingLeft: 4 + row.depth * 14 }}
              draggable={droppable && row.wellFormed}
              onDragStart={(event) => {
                if (!row.node) return;
                dragged = row.node.span;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/bbforge-node", JSON.stringify({ ...props.identity, span: row.node.span }));
                const chip = document.createElement("div"); chip.className = "drag-chip"; chip.innerHTML = ""; const tag = document.createElement("span"); tag.className = `tag-name role-${tagRole(row.tag)}`; tag.textContent = row.tag; const title = document.createElement("span"); title.textContent = row.label; chip.append(tag, title);
                if (row.count) { const count = document.createElement("small"); count.textContent = plural(Number(row.count), ["блок", "блока", "блоков"]); chip.append(count); }
                document.body.append(chip); event.dataTransfer.setDragImage?.(chip, 12, 14); setTimeout(() => chip.remove(), 0);
              }}
              onDragEnd={() => { dragged = null; setDrop(null); scroller.stop(); props.onDragHint?.(null); }}
              onDragOver={(event) => {
                if (!props.onMove || !row.node) return;
                if (dragged && row.node.span.start >= dragged.start && row.node.span.end <= dragged.end) { setDrop(null); props.onDragHint?.("Нельзя переместить блок внутрь самого себя"); return; }
                event.preventDefault(); if (viewport.current) scroller.update(viewport.current, event.clientY);
                const rect = event.currentTarget.getBoundingClientRect();
                const placement: Placement = event.clientY < rect.top + rect.height / 3 ? "before" : event.clientY > rect.bottom - rect.height / 3 || builtinOf(row.tag) !== "spoiler" ? "after" : "inside";
                if (drop?.key !== row.key || drop.placement !== placement) { setDrop({ key: row.key, placement }); props.onDragHint?.(hint(row, placement)); }
              }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Element | null)) setDrop((value) => value?.key === row.key ? null : value); }}
              onDrop={(event) => {
                event.preventDefault(); event.stopPropagation(); scroller.stop(); props.onDragHint?.(null);
                const placement = drop?.key === row.key ? drop.placement : "after"; setDrop(null); dragged = null;
                if (!row.node) return;
                try { const reference = JSON.parse(event.dataTransfer.getData("application/bbforge-node")) as NodeRef; props.onMove?.(reference, row.node.span, placement); } catch { /* foreign drag */ }
              }}>
              <button className="tree-toggle" tabIndex={-1} aria-label={`${row.expanded ? "Свернуть" : "Развернуть"} ${row.label || row.tag}`} disabled={!row.expandable} onClick={() => toggle(row)}>{row.expandable && <Icon name={row.expanded ? "chevronDown" : "chevronRight"} />}</button>
              <button role="treeitem" aria-level={row.depth + 1} aria-expanded={row.expandable ? row.expanded : undefined} aria-selected={row.node !== null && row.key === selectedKey} className="tree-item" onClick={() => row.node ? props.onNavigate(row.node.span) : toggle(row)} title={row.label}>
                <span className={`tag-name role-${tagRole(row.tag)}`}>{row.tag}</span><span className="tree-label">{row.label}</span>
                {row.errors > 0 && <span className="severity-dot error" aria-label="Есть ошибки" />}{row.warnings > 0 && <span className="severity-dot warning" aria-label="Есть предупреждения" />}
                {row.count && <small>{row.count}</small>}
              </button>
              {drop?.key === row.key && drop.placement !== "inside" && <span className={`drop-line ${drop.placement}`} style={{ left: 4 + row.depth * 14 + (drop.placement === "after" && row.expanded ? 14 : 0) }} aria-hidden="true" />}
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
