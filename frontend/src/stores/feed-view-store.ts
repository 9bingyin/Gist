import { create } from 'zustand'

export type FeedViewMode = 'normal' | 'readability' | 'browser'

const STORAGE_KEY = 'gist.feedViewModes'

function safeParse(json: string | null): Record<string, FeedViewMode> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const result: Record<string, FeedViewMode> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'normal' || value === 'readability' || value === 'browser') {
        result[key] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

function loadInitialModes(): Record<string, FeedViewMode> {
  if (typeof window === 'undefined') return {}
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

function persistModes(modes: Record<string, FeedViewMode>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modes))
  } catch {
    // ignore quota / private mode errors
  }
}

interface FeedViewStore {
  modes: Record<string, FeedViewMode>
  getExplicitMode: (feedId: string) => FeedViewMode | undefined
  getEffectiveMode: (feedId: string, fallback: FeedViewMode) => FeedViewMode
  setMode: (feedId: string, mode: FeedViewMode) => void
}

export const useFeedViewStore = create<FeedViewStore>((set, get) => ({
  modes: loadInitialModes(),

  getExplicitMode: (feedId: string) => {
    return get().modes[feedId]
  },

  getEffectiveMode: (feedId: string, fallback: FeedViewMode) => {
    return get().modes[feedId] ?? fallback
  },

  setMode: (feedId: string, mode: FeedViewMode) => {
    set((state) => {
      const next = { ...state.modes, [feedId]: mode }
      persistModes(next)
      return { modes: next }
    })
  },
}))

export const feedViewActions = {
  getExplicitMode: (feedId: string) => useFeedViewStore.getState().getExplicitMode(feedId),
  getEffectiveMode: (feedId: string, fallback: FeedViewMode) =>
    useFeedViewStore.getState().getEffectiveMode(feedId, fallback),
  setMode: (feedId: string, mode: FeedViewMode) => useFeedViewStore.getState().setMode(feedId, mode),
}
