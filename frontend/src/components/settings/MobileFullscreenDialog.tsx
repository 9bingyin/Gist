import { type ReactNode, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useBlockBackgroundScroll } from "@/hooks/useBlockBackgroundScroll";

interface MobileFullscreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header: ReactNode;
  children: ReactNode;
}

export function MobileFullscreenDialog({
  open,
  onOpenChange,
  header,
  children,
}: MobileFullscreenDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useBlockBackgroundScroll(open, contentRef);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        ref={contentRef}
        fullscreen
        aria-modal="true"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-background safe-area-inset">
          <div className="shrink-0">{header}</div>
          <div
            data-slot="mobile-dialog-scroller"
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 py-4"
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
