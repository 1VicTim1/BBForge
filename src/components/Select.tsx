import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface SelectOption<T extends string | number> { value: T; label: string }
interface Props<T extends string | number> {
  value: T | "";
  options: Array<SelectOption<T>>;
  onChange(value: T): void;
  label: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

/** A themed drop-down: the native <select> popup ignores the app's colours (WebKitGTK draws it with GTK). */
export function Select<T extends string | number>({ value, options, onChange, label, placeholder = "Выберите…", id, disabled }: Props<T>) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null), list = useId();
  const current = options.findIndex((option) => option.value === value);
  useEffect(() => { if (open) setActive(Math.max(0, current)); }, [open]);
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const box = root.current.getBoundingClientRect(), height = Math.min(280, options.length * 30 + 10);
    setAbove(box.bottom + height > window.innerHeight - 8 && box.top - height > 8);
    root.current.querySelector<HTMLElement>(`[data-index="${Math.max(0, current)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const choose = (index: number) => { const option = options[index]; if (option) onChange(option.value); setOpen(false); root.current?.querySelector("button")?.focus(); };
  return <div className={`select ${open ? "open" : ""}`} ref={root}>
    <button type="button" id={id} role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={list} disabled={disabled} className="select-trigger"
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!open) setOpen(true); else setActive((at) => Math.max(0, Math.min(options.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))); }
        else if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); choose(active); }
        else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === "Home" && open) { event.preventDefault(); setActive(0); }
        else if (event.key === "End" && open) { event.preventDefault(); setActive(options.length - 1); }
      }}>
      <span className={current < 0 ? "select-placeholder" : ""}>{current < 0 ? placeholder : options[current].label}</span><Icon name="chevronDown" />
    </button>
    {open && <div className={`select-popup ${above ? "above" : ""}`} role="listbox" id={list} aria-label={label}>
      {options.map((option, index) => <div key={String(option.value)} role="option" data-index={index} aria-selected={option.value === value} className={`select-option ${index === active ? "active" : ""}`} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Icon name="check" />}
      </div>)}
    </div>}
  </div>;
}
