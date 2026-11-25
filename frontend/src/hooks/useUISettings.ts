import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UISettings {
  feedColWidth: number;
  entryColWidth: number;
  sidebarVisible: boolean;
}

const STORAGE_KEY = "gist-ui-settings";

export const defaultUISettings: UISettings = {
  feedColWidth: 256,
  entryColWidth: 356,
  sidebarVisible: true,
};

interface UISettingsStore extends UISettings {
  sidebarVisibleCustomized: boolean;
  setSetting: <K extends keyof UISettings>(
    key: K,
    value: UISettings[K],
  ) => void;
  resetToDefaults: () => void;
}

function readLegacySettings(): Partial<UISettings> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Already in zustand persist format
    if ("state" in parsed && typeof parsed.state === "object") {
      return null;
    }
    return parsed as Partial<UISettings>;
  } catch {
    return null;
  }
}

const legacyInitial = readLegacySettings();

const useUISettingsStore = create<UISettingsStore>()(
  persist(
    (set) => ({
      ...defaultUISettings,
      ...legacyInitial,
      sidebarVisibleCustomized:
        legacyInitial !== null && "sidebarVisible" in legacyInitial,

      setSetting: (key, value) =>
        set((state) => ({
          ...state,
          [key]: value,
          sidebarVisibleCustomized:
            key === "sidebarVisible" ? true : state.sidebarVisibleCustomized,
        })),

      resetToDefaults: () =>
        set({
          ...defaultUISettings,
          sidebarVisibleCustomized: true,
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        feedColWidth: state.feedColWidth,
        entryColWidth: state.entryColWidth,
        sidebarVisible: state.sidebarVisible,
        sidebarVisibleCustomized: state.sidebarVisibleCustomized,
      }),
    },
  ),
);

export function getUISettings(): UISettings {
  const { feedColWidth, entryColWidth, sidebarVisible } =
    useUISettingsStore.getState();
  return { feedColWidth, entryColWidth, sidebarVisible };
}

export function hasSidebarVisibilitySetting(): boolean {
  return useUISettingsStore.getState().sidebarVisibleCustomized;
}

export function setUISetting<K extends keyof UISettings>(
  key: K,
  value: UISettings[K],
): void {
  useUISettingsStore.getState().setSetting(key, value);
}

export function useUISettingKey<K extends keyof UISettings>(
  key: K,
): UISettings[K] {
  return useUISettingsStore((state) => state[key]);
}

export function useUISettingActions() {
  const setFeedColWidth = useCallback((width: number) => {
    useUISettingsStore.getState().setSetting("feedColWidth", width);
  }, []);

  const setEntryColWidth = useCallback((width: number) => {
    useUISettingsStore.getState().setSetting("entryColWidth", width);
  }, []);

  const setSidebarVisible = useCallback((visible: boolean) => {
    useUISettingsStore.getState().setSetting("sidebarVisible", visible);
  }, []);

  const toggleSidebarVisible = useCallback(() => {
    const current = useUISettingsStore.getState().sidebarVisible;
    useUISettingsStore.getState().setSetting("sidebarVisible", !current);
  }, []);

  const resetToDefaults = useCallback(() => {
    useUISettingsStore.getState().resetToDefaults();
  }, []);

  return {
    setFeedColWidth,
    setEntryColWidth,
    setSidebarVisible,
    toggleSidebarVisible,
    resetToDefaults,
  };
}
