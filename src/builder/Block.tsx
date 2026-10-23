import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { formatTitle } from "../components/Preview";
import { usePreferences } from "../settings/preferences";
export function LazyBlockGroup({ eager, count, children }: { eager: boolean; count: number; children(): ReactNode }) {
  const host = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (eager || typeof IntersectionObserver === "undefined" || !host.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "1400px" });
    observer.observe(host.current); return () => observer.disconnect();
  }, [eager]);
  const measured = useRef(Math.max(30, count * 30));
  useEffect(() => { if (visible && host.current) measured.current = Math.max(30, host.current.offsetHeight); }, [visible]);
  return <div ref={host} className="lazy-block-group" style={visible ? undefined : { height: measured.current }}>{visible ? children() : null}</div>;
}
export function SpoilerBlock({ title, depth, onSelect, onInsert, onRename, dragTarget, contentEnd, children }: { title: string; depth: number; contentEnd?: number; onRename?(title: string): void; onSelect(event: MouseEvent): void; onInsert?(): void; dragTarget?: Record<`data-${string}`, string | number>; children(): ReactNode }) {
  const { spoilerOpenDepth } = usePreferences();
  const [open, setOpen] = useState(depth < spoilerOpenDepth), [editing, setEditing] = useState<string | null>(null);
  const finish = (save: boolean) => { if (editing === null) return; const value = editing.trim(); setEditing(null); if (save && value && value !== title) onRename?.(value); };
  const heading = editing === null ? formatTitle(title) : <input className="spoiler-title-input" aria-label="Изменить заголовок спойлера" autoFocus value={editing}
    onChange={(event) => setEditing(event.target.value)} onFocus={(event) => event.currentTarget.select()}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onBlur={() => finish(true)}
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); finish(true); } else if (event.key === "Escape") { event.preventDefault(); finish(false); } }}
    onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }} />;
  return <details {...dragTarget} className="builder-spoiler" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} onClick={onSelect}><summary title={onRename ? "Двойной щелчок — изменить заголовок" : undefined} onDoubleClick={(event) => { if (!onRename || editing !== null) return; event.preventDefault(); window.getSelection()?.removeAllRanges(); setEditing(title); }}>{heading}<span className="tag-label">spoiler</span></summary>{open && <div className="spoiler-body" data-at-content-end={contentEnd}>{children()}{onInsert && <button className="empty-insert" onClick={(event) => { const body = event.currentTarget.parentElement; onInsert(); requestAnimationFrame(() => { const input = body?.querySelector<HTMLElement>(".insertion-text"); if (!input) return; input.focus(); const range = document.createRange(); range.selectNodeContents(input); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }); }}>+ Вставить в спойлер</button>}</div>}</details>;
}
