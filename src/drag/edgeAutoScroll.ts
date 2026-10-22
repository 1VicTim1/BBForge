const EDGE_SIZE = 56;
const MAX_STEP = 18;

export function edgeScrollVelocity(clientY: number, bounds: Pick<DOMRect, "top" | "bottom">): number {
  if (clientY < bounds.top + EDGE_SIZE) {
    const strength = Math.max(0, Math.min(1, (bounds.top + EDGE_SIZE - clientY) / EDGE_SIZE));
    return -MAX_STEP * strength * strength;
  }
  if (clientY > bounds.bottom - EDGE_SIZE) {
    const strength = Math.max(0, Math.min(1, (clientY - bounds.bottom + EDGE_SIZE) / EDGE_SIZE));
    return MAX_STEP * strength * strength;
  }
  return 0;
}

export class EdgeAutoScroller {
  private frame: number | null = null;
  private element: HTMLElement | null = null;
  private velocity = 0;

  constructor(
    private readonly requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
    private readonly cancelFrame: (handle: number) => void = cancelAnimationFrame,
  ) {}

  update(element: HTMLElement, clientY: number): void {
    this.element = element;
    this.velocity = edgeScrollVelocity(clientY, element.getBoundingClientRect());
    if (!this.velocity) { this.stop(); return; }
    if (this.frame === null) this.frame = this.requestFrame(this.tick);
  }

  stop(): void {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.element = null;
    this.velocity = 0;
  }

  private readonly tick = () => {
    this.frame = null;
    if (!this.element || !this.velocity) return;
    const before = this.element.scrollTop;
    this.element.scrollTop += this.velocity;
    const limit = this.element.scrollHeight - this.element.clientHeight;
    if (this.element.scrollTop === before && (before <= 0 || before >= limit)) { this.stop(); return; }
    this.frame = this.requestFrame(this.tick);
  };
}
