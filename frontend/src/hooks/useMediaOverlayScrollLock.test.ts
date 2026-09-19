import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_OVERLAY_SCROLL_SETTLE_MS,
  useMediaOverlayScrollLock,
} from "./useMediaOverlayScrollLock";

let iosPWA = false;

vi.mock("@/lib/media-overlay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-overlay")>();
  return {
    ...actual,
    isIOSStandalonePWA: () => iosPWA,
  };
});

function mockScrollPosition(initial: number) {
  let scrollY = initial;
  const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const originalScrollTop = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "scrollTop",
  );
  const originalScrollTo = window.scrollTo;

  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  Object.defineProperty(document.documentElement, "scrollTop", {
    configurable: true,
    get: () => scrollY,
    set: (value: number) => {
      scrollY = value;
    },
  });
  window.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
    if (typeof options === "number") {
      scrollY = y ?? 0;
      return;
    }
    if (options && typeof options === "object" && options.top !== undefined) {
      scrollY = options.top;
    }
  });

  return {
    get value() {
      return scrollY;
    },
    set value(next: number) {
      scrollY = next;
    },
    restore() {
      if (originalScrollY) {
        Object.defineProperty(window, "scrollY", originalScrollY);
      } else {
        Reflect.deleteProperty(window, "scrollY");
      }
      if (originalScrollTop) {
        Object.defineProperty(
          document.documentElement,
          "scrollTop",
          originalScrollTop,
        );
      } else {
        Reflect.deleteProperty(document.documentElement, "scrollTop");
      }
      window.scrollTo = originalScrollTo;
    },
  };
}

function dispatchCancelable(type: "touchmove" | "wheel"): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe("useMediaOverlayScrollLock", () => {
  let scroll: ReturnType<typeof mockScrollPosition>;

  beforeEach(() => {
    iosPWA = false;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    scroll = mockScrollPosition(480);
  });

  afterEach(() => {
    scroll.restore();
    vi.useRealTimers();
  });

  it("locks body with position:fixed on non-iOS PWA", () => {
    renderHook(() => useMediaOverlayScrollLock(true));

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.top).toBe("-480px");
  });

  it("does not change root overflow on iOS PWA", () => {
    iosPWA = true;
    renderHook(() => useMediaOverlayScrollLock(true));

    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("prevents background gestures on iOS PWA without native document scroll", () => {
    iosPWA = true;
    renderHook(() => useMediaOverlayScrollLock(true));

    expect(dispatchCancelable("touchmove").defaultPrevented).toBe(true);
    expect(dispatchCancelable("wheel").defaultPrevented).toBe(true);
  });

  it("pins the captured list offset if iOS tries to scroll under the overlay", () => {
    iosPWA = true;
    renderHook(() => useMediaOverlayScrollLock(true));
    vi.mocked(window.scrollTo).mockClear();

    scroll.value = 120;
    window.dispatchEvent(new Event("scroll"));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 480,
      behavior: "auto",
    });
    expect(scroll.value).toBe(480);
  });

  it("restores the pinned offset after close even if WebKit jumps later", () => {
    iosPWA = true;
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useMediaOverlayScrollLock(open),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));
    vi.mocked(window.scrollTo).mockClear();

    scroll.value = 64;
    window.dispatchEvent(new Event("scroll"));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 480,
      behavior: "auto",
    });
    expect(scroll.value).toBe(480);
  });

  it("releases the post-close pin after the settle window", () => {
    iosPWA = true;
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useMediaOverlayScrollLock(open),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));
    act(() => {
      vi.advanceTimersByTime(MEDIA_OVERLAY_SCROLL_SETTLE_MS);
    });
    vi.mocked(window.scrollTo).mockClear();

    scroll.value = 24;
    window.dispatchEvent(new Event("scroll"));

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(scroll.value).toBe(24);
  });

  it("stops pinning when the user starts a new scroll gesture after close", () => {
    iosPWA = true;
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useMediaOverlayScrollLock(open),
      { initialProps: { open: true } },
    );

    act(() => rerender({ open: false }));
    document.dispatchEvent(new Event("touchstart", { bubbles: true }));
    vi.mocked(window.scrollTo).mockClear();

    scroll.value = 24;
    window.dispatchEvent(new Event("scroll"));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("clears body styles when a non-iOS lock closes", () => {
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useMediaOverlayScrollLock(open),
      { initialProps: { open: true } },
    );

    expect(document.body.style.position).toBe("fixed");

    act(() => rerender({ open: false }));

    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 480);
  });

  it("does not intercept gestures when closed", () => {
    renderHook(() => useMediaOverlayScrollLock(false));

    expect(dispatchCancelable("touchmove").defaultPrevented).toBe(false);
  });
});
