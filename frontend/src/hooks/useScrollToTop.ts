import { useEffect, type RefObject } from 'react'

const SCROLL_TO_TOP_EVENT = 'scrolltotop'

// Dispatch with optional scope. When scope is provided, only matching listeners respond.
// When omitted (e.g., from ScrollToTopZone), all visible listeners respond.
export function dispatchScrollToTop(scope?: string) {
  window.dispatchEvent(new CustomEvent(SCROLL_TO_TOP_EVENT, { detail: scope }))
}

// Listen for scroll-to-top events and scroll the target element to top.
// Only responds when:
// 1. The event has no scope (broadcast), or the scope matches this listener's scope
// 2. The element is visible (checked via CSS visibility)
export function useScrollToTop(
  scrollTarget: RefObject<HTMLElement | null> | HTMLElement | null,
  scope?: string
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const eventScope = (e as CustomEvent<string | undefined>).detail
      // If event has a scope, only respond if it matches
      if (eventScope && eventScope !== scope) return

      const el = scrollTarget && 'current' in scrollTarget
        ? scrollTarget.current
        : scrollTarget
      if (!el) return

      // Only respond if the element is visible (handles mobile list/detail overlap
      // where EntryList uses Tailwind `invisible` class when detail view is shown)
      if (getComputedStyle(el).visibility === 'hidden') return

      el.scrollTo({ top: 0, behavior: 'smooth' })
    }

    window.addEventListener(SCROLL_TO_TOP_EVENT, handler)
    return () => window.removeEventListener(SCROLL_TO_TOP_EVENT, handler)
  }, [scrollTarget, scope])
}
