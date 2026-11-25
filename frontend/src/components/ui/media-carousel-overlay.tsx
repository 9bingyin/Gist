import { useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MEDIA_OVERLAY_CLASSNAME,
  MEDIA_OVERLAY_TOP_END_CLASSNAME,
} from "@/lib/media-overlay";
import { useMediaOverlayScrollLock } from "@/hooks/useMediaOverlayScrollLock";

interface MediaCarouselOverlayProps {
  isOpen: boolean;
  images: string[];
  currentIndex: number;
  initialIndex: number;
  onClose: () => void;
  onReset: () => void;
  onIndexChange: (index: number) => void;
  topStart?: ReactNode;
  topEndExtra?: ReactNode;
  singleImageOverlay?: ReactNode;
  bottomBar?: ReactNode;
  carouselContainerClassName?: string;
  singleImageWrapperClassName?: string;
  slideClassName?: string;
}

export function MediaCarouselOverlay({
  isOpen,
  images,
  currentIndex,
  initialIndex,
  onClose,
  onReset,
  onIndexChange,
  topStart,
  topEndExtra,
  singleImageOverlay,
  bottomBar,
  carouselContainerClassName,
  singleImageWrapperClassName,
  slideClassName,
}: MediaCarouselOverlayProps) {
  const { t } = useTranslation();
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isEmblaNavigatingRef = useRef(false);

  const emblaOptions = useMemo(
    () => ({
      loop: false,
      startIndex: initialIndex,
      skipSnaps: false,
      duration: 25,
    }),
    [initialIndex],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  // Sync embla with store
  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      isEmblaNavigatingRef.current = true;
      const index = emblaApi.selectedScrollSnap();
      onIndexChange(index);
    };

    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onIndexChange]);

  // Scroll to index when store changes from external source
  useEffect(() => {
    if (isEmblaNavigatingRef.current) {
      isEmblaNavigatingRef.current = false;
      return;
    }
    if (emblaApi && emblaApi.selectedScrollSnap() !== currentIndex) {
      emblaApi.scrollTo(currentIndex);
    }
  }, [emblaApi, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          emblaApi?.scrollPrev();
          break;
        case "ArrowRight":
          emblaApi?.scrollNext();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, emblaApi]);

  useMediaOverlayScrollLock(isOpen);

  const handleCarouselPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleCarouselClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent bubbling to outer overlay so drag gestures never accidentally close
      e.stopPropagation();
      if (pointerDownPos.current) {
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx < 5 && dy < 5) {
          onClose();
        }
      }
      pointerDownPos.current = null;
    },
    [onClose],
  );

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence onExitComplete={onReset}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={MEDIA_OVERLAY_CLASSNAME}
          onClick={handleOverlayClick}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Top start slot (e.g. counter) */}
            {topStart}

            {/* Top end buttons */}
            <div className={cn(MEDIA_OVERLAY_TOP_END_CLASSNAME, "flex gap-2")}>
              {topEndExtra}
              <button
                type="button"
                aria-label={t("entry.close")}
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                <X className="size-6" />
              </button>
            </div>

            {/* Image carousel */}
            <div
              className={cn(
                "flex min-h-0 flex-1 items-center justify-center",
                carouselContainerClassName,
              )}
            >
              {images.length === 1 ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "relative flex size-full items-center justify-center",
                    singleImageWrapperClassName,
                  )}
                >
                  <img
                    src={images[0]}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                  {singleImageOverlay}
                </motion.div>
              ) : (
                <div
                  ref={emblaRef}
                  className="size-full min-h-0 overflow-hidden touch-none"
                  onPointerDown={handleCarouselPointerDown}
                  onClick={handleCarouselClick}
                >
                  <div className="flex size-full min-h-0 touch-none will-change-transform">
                    {images.map((src, index) => (
                      <div
                        key={src}
                        className={cn(
                          "flex min-h-0 min-w-0 flex-[0_0_100%] items-center justify-center will-change-transform",
                          slideClassName,
                        )}
                      >
                        <img
                          src={src}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          loading={
                            Math.abs(index - currentIndex) <= 1
                              ? "eager"
                              : "lazy"
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous image"
                    className={cn(
                      "absolute left-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors",
                      currentIndex === 0 ? "invisible" : "hover:bg-white/20",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      emblaApi?.scrollPrev();
                    }}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next image"
                    className={cn(
                      "absolute right-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors",
                      currentIndex === images.length - 1
                        ? "invisible"
                        : "hover:bg-white/20",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      emblaApi?.scrollNext();
                    }}
                    disabled={currentIndex === images.length - 1}
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>

            {bottomBar}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
