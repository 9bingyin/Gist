/** Detect iOS (including iPadOS desktop UA). */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Detect installed PWA / standalone display mode. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS standalone PWAs: avoid locking root overflow / position:fixed.
 * Those strategies shrink or shift the visual viewport and can pin overlays
 * under the system status bar (see App mobile-document-scroll comments).
 */
export function isIOSStandalonePWA(): boolean {
  return isIOSDevice() && isStandaloneDisplay();
}

/** Shared overlay chrome for Lightbox / ImagePreview. */
export const MEDIA_OVERLAY_CLASSNAME =
  "fixed inset-0 z-[100] flex flex-col bg-black";

export const MEDIA_OVERLAY_TOP_END_CLASSNAME =
  "absolute right-[calc(1rem+env(safe-area-inset-right,0px))] top-[calc(1rem+env(safe-area-inset-top,0px))] z-10";

export const MEDIA_OVERLAY_TOP_START_CLASSNAME =
  "absolute left-[calc(1rem+env(safe-area-inset-left,0px))] top-[calc(1rem+env(safe-area-inset-top,0px))] z-10";
