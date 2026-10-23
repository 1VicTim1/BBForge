import { useEffect, type RefObject } from "react";

const FAR = 160, DELAY = 600;

/**
 * IDE-like behaviour for the <details> menus inside `root`: a click outside, Escape, or keeping the
 * pointer far from the open menu for a moment closes it; hovering another menu title while one is
 * open switches to it.
 */
export function useMenuDismiss(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const openMenus = () => Array.from(host.querySelectorAll<HTMLDetailsElement>("details[open]"));
    const closeAll = (except?: Element) => { for (const menu of openMenus()) if (menu !== except) menu.open = false; };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const down = (event: PointerEvent) => { if (!openMenus().some((menu) => menu.contains(event.target as Node))) closeAll(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && openMenus().length) { closeAll(); (document.activeElement as HTMLElement | null)?.blur(); } };
    const move = (event: PointerEvent) => {
      const open = openMenus()[0];
      if (!open) { cancel(); return; }
      const title = (event.target as Element | null)?.closest?.("details");
      if (title && title !== open && host.contains(title)) { cancel(); open.open = false; (title as HTMLDetailsElement).open = true; return; }
      const rects = [open.querySelector("summary"), open.querySelector(".app-menu-popup")].filter(Boolean).map((element) => element!.getBoundingClientRect());
      const distance = Math.min(...rects.map((rect) => Math.hypot(Math.max(rect.left - event.clientX, 0, event.clientX - rect.right), Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom))));
      if (distance < FAR) cancel();
      else if (!timer) timer = setTimeout(() => { timer = null; closeAll(); }, DELAY);
    };
    const toggle = (event: Event) => { const menu = event.target as HTMLDetailsElement; if (menu.open) closeAll(menu); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move);
    document.addEventListener("keydown", key);
    host.addEventListener("toggle", toggle, true);
    return () => { cancel(); document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move); document.removeEventListener("keydown", key); host.removeEventListener("toggle", toggle, true); };
  }, [root]);
}
