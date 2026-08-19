import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const BLOCK_BACKGROUND_SCROLL_OPTIONS = {
  capture: true,
  passive: false,
} as const;

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    const preventBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      const target = event.target;
      if (target instanceof Node && contentRef.current?.contains(target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener(
      "touchmove",
      preventBackgroundScroll,
      BLOCK_BACKGROUND_SCROLL_OPTIONS,
    );
    document.addEventListener(
      "wheel",
      preventBackgroundScroll,
      BLOCK_BACKGROUND_SCROLL_OPTIONS,
    );

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener(
        "touchmove",
        preventBackgroundScroll,
        BLOCK_BACKGROUND_SCROLL_OPTIONS,
      );
      document.removeEventListener(
        "wheel",
        preventBackgroundScroll,
        BLOCK_BACKGROUND_SCROLL_OPTIONS,
      );
    };
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-container"
          initial="closed"
          animate="open"
          exit="closed"
        >
          {/* Overlay */}
          <motion.div
            data-slot="sheet-overlay"
            variants={{
              open: { opacity: 1 },
              closed: { opacity: 0 },
            }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed z-50 bg-black/50 touch-none overscroll-none",
              // Extend to cover safe area (notch/home indicator)
              "top-[calc(-1*env(safe-area-inset-top,0px))]",
              "bottom-[calc(-1*env(safe-area-inset-bottom,0px))]",
              "left-[calc(-1*env(safe-area-inset-left,0px))]",
              "right-[calc(-1*env(safe-area-inset-right,0px))]",
            )}
            onClick={() => onOpenChange(false)}
          />

          {/* Sheet content */}
          <motion.div
            ref={contentRef}
            data-slot="sheet-content"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.1, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50 || info.velocity.x < -300) {
                onOpenChange(false);
              }
            }}
            variants={{
              open: { x: 0 },
              closed: { x: "-100%" },
            }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50 bg-sidebar shadow-xl",
              "w-[280px] safe-area-top",
              "touch-pan-y overscroll-y-contain",
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
