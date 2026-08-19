import { dispatchScrollToTop } from "@/hooks/useScrollToTop";

// Tap zone covering the iOS safe-area-inset-top region (status bar area).
// Keep the background opaque so iOS 27 WebKit samples a fixed top-edge color
// instead of drawing its hard scroll-edge blur over the app header.
// On Android or devices without a safe area, env(safe-area-inset-top) resolves to 0,
// making the element invisible and non-interactive.
export function ScrollToTopZone() {
  return (
    <div
      onClick={() => dispatchScrollToTop()}
      className="fixed inset-x-0 top-0 z-50 bg-background"
      style={{ height: "env(safe-area-inset-top, 0px)" }}
      aria-hidden="true"
    />
  );
}
