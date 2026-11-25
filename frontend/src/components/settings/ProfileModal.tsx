import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MobileFullscreenDialog } from "./MobileFullscreenDialog";
import { ProfileSettings } from "./tabs/ProfileSettings";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileFullscreenDialog
        open={open}
        onOpenChange={onOpenChange}
        header={
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <DialogTitle className="text-lg font-bold">
              {t("profile.title")}
            </DialogTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "rounded-md p-1.5 shrink-0",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                "transition-colors focus:outline-none",
              )}
              aria-label={t("entry.close")}
            >
              <X className="size-5" />
            </button>
          </div>
        }
      >
        <ProfileSettings />
      </MobileFullscreenDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[950px] h-[800px] max-w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <DialogTitle className="text-xl font-bold">
              {t("profile.title")}
            </DialogTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "rounded-md p-1.5",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={t("entry.close")}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            <ProfileSettings />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
