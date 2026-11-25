import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SETTINGS_TABS, type SettingsTab } from "./settings-tabs";

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsSidebar({
  activeTab,
  onTabChange,
}: SettingsSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-[180px] max-w-[200px] flex-col border-r border-border bg-sidebar px-2 py-6">
      <div className="mb-4 flex h-8 items-center gap-2 px-2 font-bold text-foreground">
        <img src="/logo.svg" alt="Gist" className="size-6 rounded" />
        <span className="text-lg">Gist</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {SETTINGS_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                activeTab === item.id
                  ? "bg-item-active text-foreground"
                  : "text-muted-foreground hover:bg-item-hover hover:text-foreground",
              )}
            >
              <span className="shrink-0 text-primary/70">
                <Icon className="size-[18px]" strokeWidth={1.5} />
              </span>
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
