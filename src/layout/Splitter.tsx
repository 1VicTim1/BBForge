export function Splitter({ orientation = "vertical", value, min, max, onChange, label, ratio = false }: { orientation?: "vertical" | "horizontal"; value: number; min: number; max: number; onChange(value: number): void; label: string; ratio?: boolean }) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return <div className={`splitter ${orientation}`} role="separator" tabIndex={0} aria-label={label} aria-orientation={orientation} aria-valuenow={Math.round(value * (ratio ? 100 : 1))} aria-valuemin={min * (ratio ? 100 : 1)} aria-valuemax={max * (ratio ? 100 : 1)} onKeyDown={(event) => {
    const step = ratio ? .025 : 10;
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault(); onChange(clamp(event.key === "Home" ? min : event.key === "End" ? max : value + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -step : step)));
    }
  }} onPointerDown={(event) => {
    event.preventDefault(); const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const start = orientation === "vertical" ? event.clientX : event.clientY;
    const size = orientation === "vertical" ? target.parentElement!.clientWidth : target.parentElement!.clientHeight;
    const move = (next: PointerEvent) => onChange(clamp(value + ((orientation === "vertical" ? next.clientX : next.clientY) - start) * (orientation === "horizontal" ? -1 : 1) / (ratio ? size : 1)));
    const end = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  }} />;
}
