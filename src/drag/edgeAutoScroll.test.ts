// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EdgeAutoScroller, edgeScrollVelocity } from "./edgeAutoScroll";

describe("edgeScrollVelocity", () => {
  it("accelerates near both vertical edges and stays idle in the middle", () => {
    expect(edgeScrollVelocity(102, { top: 100, bottom: 500 })).toBeLessThan(0);
    expect(edgeScrollVelocity(498, { top: 100, bottom: 500 })).toBeGreaterThan(0);
    expect(edgeScrollVelocity(300, { top: 100, bottom: 500 })).toBe(0);
    expect(Math.abs(edgeScrollVelocity(101, { top: 100, bottom: 500 })))
      .toBeGreaterThan(Math.abs(edgeScrollVelocity(145, { top: 100, bottom: 500 })));
  });
});

describe("EdgeAutoScroller", () => {
  it("continues scrolling until stopped", () => {
    let frame: FrameRequestCallback | undefined;
    const request = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 7; });
    const cancel = vi.fn();
    const scroller = new EdgeAutoScroller(request, cancel);
    const element = document.createElement("div");
    Object.defineProperties(element, { scrollHeight: { value: 1000 }, clientHeight: { value: 400 }, scrollTop: { value: 100, writable: true } });
    element.getBoundingClientRect = () => ({ top: 0, bottom: 400 } as DOMRect);

    scroller.update(element, 395);
    frame?.(0);
    expect(element.scrollTop).toBeGreaterThan(100);
    expect(request).toHaveBeenCalledTimes(2);
    scroller.stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("stops as soon as the pointer leaves the edge zone", () => {
    const cancel = vi.fn();
    const scroller = new EdgeAutoScroller(() => 3, cancel);
    const element = document.createElement("div");
    element.getBoundingClientRect = () => ({ top: 0, bottom: 400 } as DOMRect);
    scroller.update(element, 395);
    scroller.update(element, 200);
    expect(cancel).toHaveBeenCalledWith(3);
  });
});
