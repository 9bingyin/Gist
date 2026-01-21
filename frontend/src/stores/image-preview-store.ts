import { create } from 'zustand'

interface ImagePreviewState {
  isOpen: boolean
  images: string[]
  currentIndex: number

  open: (images: string[], startIndex?: number) => void
  close: () => void
  reset: () => void
  setIndex: (index: number) => void
}

const initialState = {
  isOpen: false,
  images: [] as string[],
  currentIndex: 0,
}

export const useImagePreviewStore = create<ImagePreviewState>((set, get) => ({
  ...initialState,

  open: (images, startIndex = 0) => {
    set({
      isOpen: true,
      images,
      currentIndex: startIndex,
    })
  },

  close: () => {
    set({ isOpen: false })
  },

  reset: () => {
    set(initialState)
  },

  setIndex: (index) => {
    const { images } = get()
    if (index >= 0 && index < images.length) {
      set({ currentIndex: index })
    }
  },
}))
