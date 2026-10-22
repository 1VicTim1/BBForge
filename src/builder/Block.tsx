import { useEffect, useRef, useState, type ReactNode, type MouseEvent, type HTMLAttributes } from "react";
import { formatTitle } from "../components/Preview";
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
export function SpoilerBlock({ title, depth, onSelect, onInsert, dragHandle, dragTarget, children }: { title: string; depth: number; onSelect(event: MouseEvent): void; onInsert?(): void; dragHandle?: ReactNode; dragTarget?: HTMLAttributes<HTMLDetailsElement>; children(): ReactNode }) {
  const [open, setOpen] = useState(depth < 2);
  return <details {...dragTarget} className="builder-spoiler" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} onClick={onSelect}><summary>{dragHandle}<span className="node-icon">▣</span>{formatTitle(title)}<span className="tag-label">spoiler</span></summary>{open && <div className="spoiler-body">{children()}{onInsert && <button className="empty-insert" onClick={(event) => { const body = event.currentTarget.parentElement; onInsert(); requestAnimationFrame(() => { const input = body?.querySelector<HTMLElement>(".insertion-text"); if (!input) return; input.focus(); const range = document.createRange(); range.selectNodeContents(input); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }); }}>+ Вставить в спойлер</button>}</div>}</details>;
}
