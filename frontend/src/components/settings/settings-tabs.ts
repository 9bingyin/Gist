import {
  Database,
  Folder,
  Globe,
  Palette,
  Rss,
  Settings,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SettingsTab =
  | "general"
  | "network"
  | "appearance"
  | "ai"
  | "data"
  | "feeds"
  | "folders"
  | "advanced";

export interface SettingsTabMeta {
  id: SettingsTab;
  labelKey: string;
  icon: LucideIcon;
}

export const SETTINGS_TABS: readonly SettingsTabMeta[] = [
  { id: "general", labelKey: "settings.general", icon: Settings },
  { id: "network", labelKey: "settings.network", icon: Globe },
  { id: "appearance", labelKey: "settings.appearance", icon: Palette },
  { id: "ai", labelKey: "settings.ai", icon: Sparkles },
  { id: "data", labelKey: "settings.data", icon: Database },
  { id: "feeds", labelKey: "settings.subscriptions", icon: Rss },
  { id: "folders", labelKey: "settings.folders", icon: Folder },
  { id: "advanced", labelKey: "settings.advanced", icon: SlidersHorizontal },
];
