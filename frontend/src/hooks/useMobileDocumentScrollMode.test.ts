import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileDocumentScrollMode } from "./useMobileDocumentScrollMode";

describe("useMobileDocumentScrollMode", () => {
  const originalScrollRestoration = history.scrollRestoration;

  beforeEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    history.scrollRestoration = "auto";
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 240,
    });
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    history.scrollRestoration = originalScrollRestoration;
    vi.restoreAllMocks();
  });

  it("enables document scrolling and manual restoration", () => {
    const { unmount } = renderHook(() =>
      useMobileDocumentScrollMode({ enabled: true, locked: false }),
    );

    expect(document.documentElement.classList).toContain(
      "mobile-document-scroll",
    );
    expect(document.body.classList).toContain("mobile-document-scroll");
    expect(history.scrollRestoration).toBe("manual");

    unmount();

    expect(document.documentElement.classList).not.toContain(
      "mobile-document-scroll",
    );
    expect(history.scrollRestoration).toBe("auto");
  });

  it("locks overlays without losing the list position", () => {
    const { rerender } = renderHook(
      ({ locked }: { locked: boolean }) =>
        useMobileDocumentScrollMode({ enabled: true, locked }),
      { initialProps: { locked: false } },
    );

    rerender({ locked: true });
    expect(document.documentElement.classList).toContain(
      "mobile-document-scroll-locked",
    );

    act(() => rerender({ locked: false }));

    expect(document.documentElement.classList).not.toContain(
      "mobile-document-scroll-locked",
    );
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 240,
      behavior: "auto",
    });
  });

  it("leaves global scrolling unchanged when disabled", () => {
    renderHook(() =>
      useMobileDocumentScrollMode({ enabled: false, locked: false }),
    );

    expect(document.documentElement.className).toBe("");
    expect(document.body.className).toBe("");
    expect(history.scrollRestoration).toBe("auto");
  });
});
