import { useCallback, useSyncExternalStore } from 'react'

interface UISettings {
  feedColWidth: number
  entryColWidth: number
}

const STORAGE_KEY = 'gist-ui-settings'

export const defaultUISettings: UISettings = {
  feedColWidth: 256,
  entryColWidth: 356,
}

function getStoredSettings(): UISettings {
  if (typeof window === 'undefined') return defaultUISettings
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...defaultUISettings, ...JSON.parse(stored) }
    }
  } catch {
    // ignore parse errors
  }
  return defaultUISettings
}

let cachedSettings: UISettings = getStoredSettings()
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export function getUISettings(): UISettings {
  return cachedSettings
}

export function setUISetting<K extends keyof UISettings>(
  key: K,
  value: UISettings[K]
): void {
  cachedSettings = { ...cachedSettings, [key]: value }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSettings))
  } catch {
    // ignore storage errors
  }
  emitChange()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): UISettings {
  return cachedSettings
}

export function useUISettings(): UISettings {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaultUISettings)
}

export function useUISettingKey<K extends keyof UISettings>(key: K): UISettings[K] {
  const settings = useUISettings()
  return settings[key]
}

export function useUISettingActions() {
  const setFeedColWidth = useCallback((width: number) => {
    setUISetting('feedColWidth', width)
  }, [])

  const setEntryColWidth = useCallback((width: number) => {
    setUISetting('entryColWidth', width)
  }, [])

  const resetToDefaults = useCallback(() => {
    setUISetting('feedColWidth', defaultUISettings.feedColWidth)
    setUISetting('entryColWidth', defaultUISettings.entryColWidth)
  }, [])

  return {
    setFeedColWidth,
    setEntryColWidth,
    resetToDefaults,
  }
}
