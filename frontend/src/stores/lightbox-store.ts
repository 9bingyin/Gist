import { create } from 'zustand'
import type { Entry, Feed } from '@/types/api'

interface LightboxState {
  isOpen: boolean
  entry: Entry | null
  feed: Feed | null
  images: string[]
  currentIndex: number

  open: (entry: Entry, feed: Feed | undefined, images: string[], startIndex?: number) => void
  close: () => void
  setIndex: (index: number) => void
  next: () => void
  prev: () => void
}

export const useLightboxStore = create<LightboxState>((set, get) => ({
  isOpen: false,
  entry: null,
  feed: null,
  images: [],
  currentIndex: 0,

  open: (entry, feed, images, startIndex = 0) => {
    set({
      isOpen: true,
      entry,
      feed: feed ?? null,
      images,
      currentIndex: startIndex,
    })
  },

  close: () => {
    set({
      isOpen: false,
      entry: null,
      feed: null,
      images: [],
      currentIndex: 0,
    })
  },

  setIndex: (index) => {
    const { images } = get()
    if (index >= 0 && index < images.length) {
      set({ currentIndex: index })
    }
  },

  next: () => {
    const { currentIndex, images } = get()
    if (currentIndex < images.length - 1) {
      set({ currentIndex: currentIndex + 1 })
    }
  },

  prev: () => {
    const { currentIndex } = get()
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 })
    }
  },
}))
