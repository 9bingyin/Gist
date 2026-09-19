import { useEffect, useLayoutEffect, useRef } from "react";
import {
  applyIOSPWAOverlayInsets,
  isIOSStandalonePWA,
} from "@/lib/media-overlay";

export const MEDIA_OVERLAY_SCROLL_SETTLE_MS = 450;

const PIN_SCROLL_OPTIONS = { capture: true, passive: true } as const;
const PREVENT_SCROLL_OPTIONS = { capture: true, passive: false } as const;

function getScrollY(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function restoreScrollY(top: number): void {
  window.scrollTo({ top, behavior: "auto" });
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}

function blurActiveElement(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
}

function pinScroll(top: number): () => void {
  const restore = () => {
    if (getScrollY() !== top) {
      restoreScrollY(top);
    }
  };

  window.addEventListener("scroll", restore, PIN_SCROLL_OPTIONS);
  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener("scroll", restore);
  visualViewport?.addEventListener("resize", restore);
  restore();

  return () => {
    window.removeEventListener("scroll", restore, PIN_SCROLL_OPTIONS);
    visualViewport?.removeEventListener("scroll", restore);
    visualViewport?.removeEventListener("resize", restore);
  };
}

function preventNativeScroll(event: TouchEvent | WheelEvent): void {
  event.preventDefault();
}

function lockIOSPWAScroll(top: number): () => void {
  const stopPin = pinScroll(top);
  document.addEventListener(
    "touchmove",
    preventNativeScroll,
    PREVENT_SCROLL_OPTIONS,
  );
  document.addEventListener(
    "wheel",
    preventNativeScroll,
    PREVENT_SCROLL_OPTIONS,
  );

  return () => {
    document.removeEventListener(
      "touchmove",
      preventNativeScroll,
      PREVENT_SCROLL_OPTIONS,
    );
    document.removeEventListener(
      "wheel",
      preventNativeScroll,
      PREVENT_SCROLL_OPTIONS,
    );
    stopPin();
  };
}

function holdScrollUntilSettle(top: number): () => void {
  const stopPin = pinScroll(top);
  restoreScrollY(top);

  const rafIds: number[] = [];
  rafIds.push(
    window.requestAnimationFrame(() => {
      restoreScrollY(top);
      rafIds.push(
        window.requestAnimationFrame(() => {
          restoreScrollY(top);
        }),
      );
    }),
  );

  let cleaned = false;
  let timer = 0;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    stopPin();
    document.removeEventListener("touchstart", cleanup, PIN_SCROLL_OPTIONS);
    document.removeEventListener("wheel", cleanup, PIN_SCROLL_OPTIONS);
    for (const id of rafIds) {
      window.cancelAnimationFrame(id);
    }
    window.clearTimeout(timer);
  };

  document.addEventListener("touchstart", cleanup, PIN_SCROLL_OPTIONS);
  document.addEventListener("wheel", cleanup, PIN_SCROLL_OPTIONS);
  timer = window.setTimeout(cleanup, MEDIA_OVERLAY_SCROLL_SETTLE_MS);
  return cleanup;
}

function lockBodyFixed(scrollY: number): () => void {
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.overflow = "hidden";

  return () => {
    const storedTop = document.body.style.top;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";

    if (storedTop) {
      window.scrollTo(0, parseInt(storedTop, 10) * -1);
    }
  };
}

/**
 * Lock background scrolling while a media overlay is open.
 *
 * iOS standalone PWAs cannot use root overflow / position:fixed without
 * shifting the visual viewport under the status bar. After document-scroll
 * lists landed, a one-shot touchmove lock is not enough: WebKit can still
 * jump window.scrollY on overlay teardown. Pin the captured offset for the
 * overlay lifetime and for a short settle window after close.
 */
export function useMediaOverlayScrollLock(isOpen: boolean): void {
  const settleCleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    applyIOSPWAOverlayInsets();
    if (!isOpen) return;

    settleCleanupRef.current?.();
    settleCleanupRef.current = null;
    blurActiveElement();

    const lockedY = getScrollY();
    const isIOSPWA = isIOSStandalonePWA();
    const release = isIOSPWA
      ? lockIOSPWAScroll(lockedY)
      : lockBodyFixed(lockedY);

    return () => {
      blurActiveElement();
      release();
      if (isIOSPWA) {
        settleCleanupRef.current = holdScrollUntilSettle(lockedY);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      settleCleanupRef.current?.();
      settleCleanupRef.current = null;
    };
  }, []);
}
