import { type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        fullscreen
        aria-modal="true"
        data-slot="mobile-dialog-scroller"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="sticky top-0 z-10 bg-background safe-area-top">
          {header}
        </div>
        <div className="px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
