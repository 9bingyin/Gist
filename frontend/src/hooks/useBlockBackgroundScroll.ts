import { useEffect, type RefObject } from "react";

const BLOCK_BACKGROUND_SCROLL_OPTIONS = {
  capture: true,
  passive: false,
} as const;

const OVERLAY_SCROLL_SELECTOR =
  '[data-slot="mobile-dialog-scroller"], [role="dialog"]';

export function useBlockBackgroundScroll(
  enabled: boolean,
  allowRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!enabled) return;

    const preventBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      const target = event.target;
      if (target instanceof Node && allowRef.current?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(OVERLAY_SCROLL_SELECTOR)
      ) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener(
      "touchmove",
      preventBackgroundScroll,
      BLOCK_BACKGROUND_SCROLL_OPTIONS,
    );
    document.addEventListener(
      "wheel",
      preventBackgroundScroll,
      BLOCK_BACKGROUND_SCROLL_OPTIONS,
    );

    return () => {
      document.removeEventListener(
        "touchmove",
        preventBackgroundScroll,
        BLOCK_BACKGROUND_SCROLL_OPTIONS,
      );
      document.removeEventListener(
        "wheel",
        preventBackgroundScroll,
        BLOCK_BACKGROUND_SCROLL_OPTIONS,
      );
    };
  }, [enabled, allowRef]);
}
