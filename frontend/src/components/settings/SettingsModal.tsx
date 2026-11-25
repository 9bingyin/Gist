import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MobileFullscreenDialog } from "./MobileFullscreenDialog";
import { SettingsSidebar } from "./SettingsSidebar";
import { SETTINGS_TABS, type SettingsTab } from "./settings-tabs";
import { GeneralSettings } from "./tabs/GeneralSettings";
import { AppearanceSettings } from "./tabs/AppearanceSettings";
import { DataControl } from "./tabs/DataControl";
import { FeedsSettings } from "./tabs/FeedsSettings";
import { FoldersSettings } from "./tabs/FoldersSettings";
import { AISettings } from "./tabs/AISettings";
import { NetworkSettings } from "./tabs/NetworkSettings";
import { AdvancedSettings } from "./tabs/AdvancedSettings";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

export type { SettingsTab } from "./settings-tabs";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("general");
    }
  }, [open]);

  const renderContent = () => {
    switch (activeTab) {
      case "general":
        return <GeneralSettings />;
      case "network":
        return <NetworkSettings />;
      case "appearance":
        return <AppearanceSettings />;
      case "ai":
        return <AISettings />;
      case "data":
        return <DataControl />;
      case "feeds":
        return <FeedsSettings />;
      case "folders":
        return <FoldersSettings />;
      case "advanced":
        return <AdvancedSettings />;
      default:
        return null;
    }
  };

  const activeMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab);
  const title = activeMeta ? t(activeMeta.labelKey) : t("settings.title");

  if (isMobile) {
    return (
      <MobileFullscreenDialog
        open={open}
        onOpenChange={onOpenChange}
        header={
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <div className="relative flex-1">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
                aria-label={t("settings.title")}
                className={cn(
                  "w-full h-9 appearance-none rounded-md border border-border bg-background pl-3 pr-8 text-base font-medium",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                )}
              >
                {SETTINGS_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {t(tab.labelKey)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
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
        {renderContent()}
      </MobileFullscreenDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[950px] h-[800px] max-w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0">
        <div className="flex h-full">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              {renderContent()}
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "absolute right-4 top-4 rounded-md p-1.5",
                "text-muted-foreground hover:text-foreground hover:bg-accent",
                "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={t("entry.close")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
