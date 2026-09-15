import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { useBlockBackgroundScroll } from "./useBlockBackgroundScroll";

function dispatchScrollGesture(
  target: EventTarget,
  type: "touchmove" | "wheel",
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("useBlockBackgroundScroll", () => {
  it("blocks background scrolling without changing root overflow", () => {
    const allowRef = createRef<HTMLDivElement>();
    const allowed = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(allowed, outside);
    allowRef.current = allowed;

    renderHook(() => useBlockBackgroundScroll(true, allowRef));

    expect(document.body.style.overflow).toBe("");
    expect(dispatchScrollGesture(outside, "touchmove").defaultPrevented).toBe(
      true,
    );
    expect(dispatchScrollGesture(outside, "wheel").defaultPrevented).toBe(true);
    expect(dispatchScrollGesture(allowed, "touchmove").defaultPrevented).toBe(
      false,
    );

    allowed.remove();
    outside.remove();
  });

  it("does not intercept scrolling when disabled", () => {
    const allowRef = createRef<HTMLDivElement>();
    renderHook(() => useBlockBackgroundScroll(false, allowRef));

    expect(
      dispatchScrollGesture(document.body, "touchmove").defaultPrevented,
    ).toBe(false);
  });

  it("removes listeners when unmounted", () => {
    const allowRef = createRef<HTMLDivElement>();
    const { unmount } = renderHook(() =>
      useBlockBackgroundScroll(true, allowRef),
    );
    unmount();

    expect(
      dispatchScrollGesture(document.body, "touchmove").defaultPrevented,
    ).toBe(false);
  });
});
