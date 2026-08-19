import { dispatchScrollToTop } from "@/hooks/useScrollToTop";

// Compatibility tap zone for edge-to-edge WebKit viewports.
// The default contained PWA viewport resolves the inset to 0 and lets iOS handle
// status-bar taps through the main document scroll view.
export function ScrollToTopZone() {
  return (
    <div
      onClick={() => dispatchScrollToTop()}
      className="fixed inset-x-0 top-0 z-50"
      style={{ height: "env(safe-area-inset-top, 0px)" }}
      aria-hidden="true"
    />
  );
}
