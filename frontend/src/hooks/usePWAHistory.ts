import { useEffect, useRef } from 'react'

/**
 * Check if running as iOS PWA in standalone mode
 */
function isIOSStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'standalone' in window.navigator &&
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Hook to handle iOS PWA history navigation issues.
 *
 * In iOS PWA standalone mode, the system's edge swipe gesture triggers
 * browser history navigation. When the history stack is empty or user
 * swipes back past the app's initial state, it shows a blank page.
 *
 * Strategy:
 * - Only intercept popstate events that would navigate to our anchor
 * - Use anchor state (pwaAnchor) as the only marker
 * - Track current URL and restore when hitting anchor
 */
export function usePWAHistory() {
  const currentUrlRef = useRef<string>('')

  useEffect(() => {
    // Only apply for iOS PWA standalone mode
    if (!isIOSStandalone()) return

    // Initialize - save current URL
    currentUrlRef.current = window.location.href

    // Push an anchor entry to catch back gestures that go too far
    window.history.pushState(
      { pwaAnchor: true },
      '',
      window.location.href
    )

    // Handle popstate in capture phase - runs BEFORE wouter's handler
    const handlePopState = (event: PopStateEvent) => {
      // Only intercept if this is our anchor entry
      if (event.state?.pwaAnchor) {
        // Stop the event from reaching wouter
        event.stopImmediatePropagation()

        // Push back to the current URL (not replace, to maintain position)
        window.history.pushState(
          null,
          '',
          currentUrlRef.current
        )

        // Push another anchor for future back gestures
        window.history.pushState(
          { pwaAnchor: true },
          '',
          currentUrlRef.current
        )
      } else {
        // Normal back navigation within app - update tracked URL
        currentUrlRef.current = window.location.href
      }
    }

    // Use capture phase to intercept before wouter
    window.addEventListener('popstate', handlePopState, true)
    return () => window.removeEventListener('popstate', handlePopState, true)
  }, [])

  // Track URL changes from programmatic navigation (wouter's navigate calls pushState)
  // This runs on every render but only updates ref when URL changes
  useEffect(() => {
    if (!isIOSStandalone()) return
    if (window.location.href !== currentUrlRef.current) {
      currentUrlRef.current = window.location.href
    }
  })
}
