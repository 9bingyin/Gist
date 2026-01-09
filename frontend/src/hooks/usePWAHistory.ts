import { useEffect, useRef } from 'react'
import { useLocation, useSearch } from 'wouter'

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
 * In iOS PWA standalone mode, swiping back past the initial page shows a blank page.
 * This hook prevents that by restoring the last valid URL when the user goes too far back.
 */
export function usePWAHistory() {
  const [location] = useLocation()
  const search = useSearch()
  const lastValidUrlRef = useRef<string>('')

  useEffect(() => {
    if (!isIOSStandalone()) return

    // Initialize
    lastValidUrlRef.current = window.location.href

    // Mark current state as valid
    window.history.replaceState(
      { ...window.history.state, pwaValid: true },
      ''
    )

    const handlePopState = (event: PopStateEvent) => {
      // Valid state - update tracked URL
      if (event.state?.pwaValid) {
        lastValidUrlRef.current = window.location.href
        return
      }

      // Invalid state - user went back too far, restore
      event.stopImmediatePropagation()
      window.history.pushState(
        { pwaValid: true },
        '',
        lastValidUrlRef.current
      )
    }

    window.addEventListener('popstate', handlePopState, true)
    return () => window.removeEventListener('popstate', handlePopState, true)
  }, [])

  // Track URL changes from wouter navigation (both pathname and search)
  useEffect(() => {
    if (!isIOSStandalone()) return

    // Mark new states as valid when URL changes
    if (!window.history.state?.pwaValid) {
      window.history.replaceState(
        { ...window.history.state, pwaValid: true },
        ''
      )
    }
    lastValidUrlRef.current = window.location.href
  }, [location, search])
}
