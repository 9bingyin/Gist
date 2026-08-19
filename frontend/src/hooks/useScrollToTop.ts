import { useEffect, type RefObject } from "react";

const SCROLL_TO_TOP_EVENT = "scrolltotop";

// Dispatch with optional scope. When scope is provided, only matching listeners respond.
// When omitted (e.g., from ScrollToTopZone), all visible listeners respond.
export function dispatchScrollToTop(scope?: string) {
  window.dispatchEvent(new CustomEvent(SCROLL_TO_TOP_EVENT, { detail: scope }));
}

type ScrollToTopTarget =
  | RefObject<HTMLElement | null>
  | HTMLElement
  | (() => void)
  | null;

// Listen for scroll-to-top events and scroll the active target to top.
// Element targets retain the visibility check used by overlapping mobile views.
export function useScrollToTop(
  scrollTarget: ScrollToTopTarget,
  scope?: string,
  enabled = true,
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const eventScope = (e as CustomEvent<string | undefined>).detail;
      if (!enabled || (eventScope && eventScope !== scope)) return;

      if (typeof scrollTarget === "function") {
        scrollTarget();
        return;
      }

      const el =
        scrollTarget && "current" in scrollTarget
          ? scrollTarget.current
          : scrollTarget;
      if (!el) return;

      // Only respond if the element is visible (handles mobile list/detail overlap
      // where EntryList uses Tailwind `invisible` class when detail view is shown)
      if (getComputedStyle(el).visibility === "hidden") return;

      el.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener(SCROLL_TO_TOP_EVENT, handler);
    return () => window.removeEventListener(SCROLL_TO_TOP_EVENT, handler);
  }, [enabled, scrollTarget, scope]);
}
