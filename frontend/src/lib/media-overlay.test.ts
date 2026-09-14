import { describe, expect, it, afterEach } from "vitest";
import {
  MEDIA_OVERLAY_CLASSNAME,
  MEDIA_OVERLAY_TOP_END_CLASSNAME,
  MEDIA_OVERLAY_TOP_START_CLASSNAME,
  applyIOSPWAOverlayInsets,
} from "./media-overlay";

describe("media overlay chrome", () => {
  afterEach(() => {
    document.documentElement.classList.remove("ios-standalone-pwa");
  });

  it("uses an opaque full-viewport layer above document headers", () => {
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("fixed");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("inset-0");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("bg-black");
    expect(MEDIA_OVERLAY_CLASSNAME).toContain("z-[100]");
    expect(MEDIA_OVERLAY_CLASSNAME).not.toContain("bg-black/90");
    expect(MEDIA_OVERLAY_CLASSNAME).not.toContain("h-dvh");
  });

  it("offsets controls with safe-area insets and an iOS PWA fallback", () => {
    expect(MEDIA_OVERLAY_TOP_END_CLASSNAME).toContain(
      "env(safe-area-inset-top,0px)",
    );
    expect(MEDIA_OVERLAY_TOP_END_CLASSNAME).toContain(
      "--ios-pwa-top-fallback,0px",
    );
    expect(MEDIA_OVERLAY_TOP_END_CLASSNAME).toContain(
      "env(safe-area-inset-right,0px)",
    );
    expect(MEDIA_OVERLAY_TOP_START_CLASSNAME).toContain(
      "env(safe-area-inset-left,0px)",
    );
  });

  it("marks the document as iOS standalone PWA when both signals match", () => {
    const originalNavigator = navigator;
    const originalMatchMedia = window.matchMedia;

    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: {
        ...originalNavigator,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: true,
      },
    });
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("display-mode: standalone"),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

    applyIOSPWAOverlayInsets();
    expect(
      document.documentElement.classList.contains("ios-standalone-pwa"),
    ).toBe(true);

    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    window.matchMedia = originalMatchMedia;
    document.documentElement.classList.remove("ios-standalone-pwa");
    applyIOSPWAOverlayInsets();
    expect(
      document.documentElement.classList.contains("ios-standalone-pwa"),
    ).toBe(false);
  });
});
