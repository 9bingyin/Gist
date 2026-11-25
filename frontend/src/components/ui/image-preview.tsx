import { useShallow } from "zustand/react/shallow";
import { MEDIA_OVERLAY_TOP_START_CLASSNAME } from "@/lib/media-overlay";
import { useImagePreviewStore } from "@/stores/image-preview-store";
import { MediaCarouselOverlay } from "./media-carousel-overlay";

export function ImagePreview() {
  const { isOpen, images, currentIndex, initialIndex, close, reset, setIndex } =
    useImagePreviewStore(
      useShallow((s) => ({
        isOpen: s.isOpen,
        images: s.images,
        currentIndex: s.currentIndex,
        initialIndex: s.initialIndex,
        close: s.close,
        reset: s.reset,
        setIndex: s.setIndex,
      })),
    );

  return (
    <MediaCarouselOverlay
      isOpen={isOpen}
      images={images}
      currentIndex={currentIndex}
      initialIndex={initialIndex}
      onClose={close}
      onReset={reset}
      onIndexChange={setIndex}
      singleImageWrapperClassName="safe-area-x"
      topStart={
        images.length > 1 ? (
          <div className={MEDIA_OVERLAY_TOP_START_CLASSNAME}>
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
              {currentIndex + 1} / {images.length}
            </div>
          </div>
        ) : null
      }
    />
  );
}
