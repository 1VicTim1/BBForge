import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

export function TooltipButton({ label, description, shortcut, children, className = "", ...button }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; description: string; shortcut?: string; children: ReactNode }) {
  const id = useId();
  return <span className={`tooltip-control ${className}`}>
    <button {...button} aria-label={label} aria-describedby={id}>{children}</button>
    <span id={id} role="tooltip" aria-label={`${label}. ${description}`} className="control-tooltip"><strong>{label}</strong><span>{description}</span>{shortcut && <kbd>{shortcut}</kbd>}</span>
  </span>;
}
