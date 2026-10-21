import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ContextCommand } from "./commands";

export function ContextMenu({ x, y, commands, onClose }: { x: number; y: number; commands: ContextCommand[]; onClose(): void }) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect(); if (!box) return;
    setPosition({ x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) });
  }, [x, y, commands]);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => onClose(); window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [onClose]);
  const key = (event: React.KeyboardEvent) => {
    const buttons = Array.from(root.current!.querySelectorAll<HTMLButtonElement>("button")), at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === "Home") { event.preventDefault(); buttons[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); buttons.at(-1)?.focus(); }
  };
  return <><div className="context-menu-dismiss" onPointerDown={onClose} /><div ref={root} className="context-menu" role="menu" aria-label="Контекстное меню" style={{ left: position.x, top: position.y }} onKeyDown={key}>
    {commands.map((command) => <button role="menuitem" key={command.id} onClick={() => { command.run(); onClose(); }}><span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
  </div></>;
}
