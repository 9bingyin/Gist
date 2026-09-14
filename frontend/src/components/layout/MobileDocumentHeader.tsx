import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";
import { useLightboxStore } from "@/stores/lightbox-store";
import { useImagePreviewStore } from "@/stores/image-preview-store";

interface MobileDocumentHeaderProps {
  enabled: boolean;
  headerRef: RefObject<HTMLDivElement | null>;
  testId: string;
  children: ReactNode;
}

export function MobileDocumentHeader({
  enabled,
  headerRef,
  testId,
  children,
}: MobileDocumentHeaderProps) {
  // Media overlays can lose the iOS stacking contest against this fixed header;
  // hide it while either overlay is open so list chrome never bleeds through.
  const lightboxOpen = useLightboxStore((state) => state.isOpen);
  const previewOpen = useImagePreviewStore((state) => state.isOpen);
  const mediaOverlayOpen = lightboxOpen || previewOpen;

  return (
    <>
      <div
        ref={headerRef}
        data-testid={testId}
        className={cn(
          enabled && "fixed inset-x-0 top-0 z-20",
          mediaOverlayOpen && "invisible pointer-events-none",
        )}
        aria-hidden={mediaOverlayOpen || undefined}
      >
        {/* Hide short WebKit compositor gaps during momentum scrolling. */}
        {enabled && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-2 -bottom-px bg-background"
          />
        )}
        <div className={cn(enabled && "relative")}>{children}</div>
      </div>
      {enabled && <div aria-hidden="true" className="h-14" />}
    </>
  );
}
