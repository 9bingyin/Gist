import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEntryListScrollSurface } from "./scroll-surface";

describe("useEntryListScrollSurface", () => {
  const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const originalScrollTo = window.scrollTo;

  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, "clientHeight");
    Reflect.deleteProperty(document.documentElement, "scrollHeight");
    Reflect.deleteProperty(document.documentElement, "scrollTop");
    Reflect.deleteProperty(document.body, "scrollHeight");
    if (originalScrollY) {
      Object.defineProperty(window, "scrollY", originalScrollY);
    }
    window.scrollTo = originalScrollTo;
    vi.restoreAllMocks();
  });

  it("keeps desktop lists on their element scroll container", () => {
    const container = document.createElement("div");
    container.scrollTo = vi.fn();
    Object.defineProperties(container, {
      scrollTop: { configurable: true, writable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1800 },
      clientHeight: { configurable: true, value: 900 },
    });
    const containerRef = { current: container };
    const headerRef = { current: null };

    const { result } = renderHook(() =>
      useEntryListScrollSurface({
        documentScroll: false,
        containerRef,
        headerRef,
      }),
    );

    expect(result.current.kind).toBe("element");
    expect(result.current.getDistanceToBottom()).toBe(600);
    expect(result.current.getIntersectionRoot()).toBe(container);

    result.current.scrollTo(20, "smooth");
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 20,
      behavior: "smooth",
    });
  });

  it("uses window scrolling for mobile lists", () => {
    const header = document.createElement("div");
    header.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 390,
      height: 56,
      top: 0,
      bottom: 56,
      left: 0,
      right: 390,
      toJSON: () => ({}),
    });
    const containerRef = { current: document.createElement("div") };
    const headerRef = { current: header };
    Object.defineProperties(document.documentElement, {
      clientHeight: { configurable: true, value: 800 },
      scrollHeight: { configurable: true, value: 2000 },
      scrollTop: { configurable: true, value: 400 },
    });
    Object.defineProperty(document.body, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 400,
    });
    window.scrollTo = vi.fn();

    const { result } = renderHook(() =>
      useEntryListScrollSurface({
        documentScroll: true,
        containerRef,
        headerRef,
      }),
    );

    expect(result.current.kind).toBe("document");
    expect(result.current.getDistanceToBottom()).toBe(800);
    expect(result.current.getViewportRect()).toEqual({
      top: 56,
      bottom: 800,
      height: 744,
    });
    expect(result.current.getIntersectionRoot()).toBeNull();

    result.current.scrollBy(-120);
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 280,
      behavior: "auto",
    });
  });
});
