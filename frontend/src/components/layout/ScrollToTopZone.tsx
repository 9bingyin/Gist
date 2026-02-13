import { dispatchScrollToTop } from '@/hooks/useScrollToTop'

// Transparent tap zone covering the iOS safe-area-inset-top region (status bar area).
// On iOS PWA standalone mode, this area is within the web view (viewport-fit=cover).
// On Android or devices without safe area, env(safe-area-inset-top) resolves to 0,
// making the element invisible and non-interactive.
export function ScrollToTopZone() {
  return (
    <div
      onClick={() => dispatchScrollToTop()}
      className="fixed inset-x-0 top-0 z-50"
      style={{ height: 'env(safe-area-inset-top, 0px)' }}
      aria-hidden="true"
    />
  )
}
