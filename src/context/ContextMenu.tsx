import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContextCommand } from "./commands";

/** One panel of the menu; a submenu opens to the side on hover, click or ArrowRight. */
function Panel({ commands, x, y, onClose, onBack, label }: { commands: ContextCommand[]; x: number; y: number; onClose(): void; onBack?(): void; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [open, setOpen] = useState<{ id: string; x: number; y: number; focus: boolean } | null>(null);
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect(); if (!box) return;
    // A submenu that does not fit on the right opens on the left of its parent.
    const left = onBack && x + box.width > window.innerWidth - 4 ? x - box.width - (root.current?.parentElement?.getBoundingClientRect().width ?? 0) : x;
    setPosition({ x: Math.max(4, Math.min(left, window.innerWidth - box.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) });
  }, [x, y, commands]);
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus(); }, []);
  const show = (button: HTMLElement, id: string, focus: boolean) => { const box = button.getBoundingClientRect(); setOpen({ id, x: box.right - 2, y: box.top - 4, focus }); };
  const key = (event: React.KeyboardEvent) => {
    // Keys inside a submenu are its own.
    if (event.target instanceof HTMLElement && event.target.closest(".context-menu") !== root.current) return;
    const buttons = Array.from(root.current!.querySelectorAll<HTMLButtonElement>(":scope > button")), at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const current = buttons[at];
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (onBack) onBack(); else onClose(); }
    if (event.key === "ArrowLeft" && onBack) { event.preventDefault(); event.stopPropagation(); onBack(); }
    if (event.key === "ArrowRight" && current?.dataset.submenu) { event.preventDefault(); event.stopPropagation(); show(current, current.dataset.submenu, true); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); setOpen(null); buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === "Home") { event.preventDefault(); buttons[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); buttons.at(-1)?.focus(); }
  };
  const submenu = open && commands.find((command) => command.id === open.id)?.children;
  return <div ref={root} className="context-menu" role="menu" aria-label={label} style={{ left: position.x, top: position.y }} onKeyDown={key}>
    {commands.map((command) => command.kind === "separator" ? <div key={command.id} className="context-menu-separator" role="separator" />
      : command.kind === "header" ? <div key={command.id} className="context-menu-header" role="presentation">{command.label}</div>
      : command.children ? <button role="menuitem" key={command.id} aria-haspopup="menu" aria-expanded={open?.id === command.id} data-submenu={command.id}
          onPointerEnter={(event) => show(event.currentTarget, command.id, false)} onClick={(event) => show(event.currentTarget, command.id, true)}><span>{command.label}</span><span className="context-menu-arrow" aria-hidden="true">›</span></button>
      : <button role="menuitem" key={command.id} onPointerEnter={() => setOpen(null)} onClick={() => { command.run(); onClose(); }}><span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
    {submenu && <SubPanel key={open.id} commands={submenu} x={open.x} y={open.y} focus={open.focus} onClose={onClose} onBack={() => { const id = open.id; setOpen(null); root.current?.querySelector<HTMLButtonElement>(`[data-submenu="${id}"]`)?.focus(); }} label={commands.find((command) => command.id === open.id)?.label ?? ""} />}
  </div>;
}

function SubPanel(props: { commands: ContextCommand[]; x: number; y: number; focus: boolean; onClose(): void; onBack(): void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  // Opened by hovering, the submenu does not take the keyboard focus.
  useEffect(() => { if (!props.focus) (document.activeElement as HTMLElement | null)?.closest(".context-menu")?.querySelector<HTMLButtonElement>("[aria-expanded='true']")?.focus(); }, [props.focus]);
  return <div ref={host} className="context-submenu"><Panel {...props} /></div>;
}

export function ContextMenu({ x, y, commands, onClose }: { x: number; y: number; commands: ContextCommand[]; onClose(): void }) {
  useEffect(() => {
    const close = () => onClose(); window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [onClose]);
  return <><div className="context-menu-dismiss" onPointerDown={onClose} /><Panel commands={commands} x={x} y={y} onClose={onClose} label="Контекстное меню" /></>;
}
