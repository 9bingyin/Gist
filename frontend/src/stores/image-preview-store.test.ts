import { describe, it, expect, beforeEach } from 'vitest'
import { useImagePreviewStore } from './image-preview-store'

const mockImages = [
  'https://example.com/img1.jpg',
  'https://example.com/img2.jpg',
  'https://example.com/img3.jpg',
]

describe('image-preview-store', () => {
  beforeEach(() => {
    useImagePreviewStore.getState().reset()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.images).toEqual([])
      expect(state.currentIndex).toBe(0)
    })
  })

  describe('open', () => {
    it('should open preview with images', () => {
      useImagePreviewStore.getState().open(mockImages)

      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(true)
      expect(state.images).toEqual(mockImages)
      expect(state.currentIndex).toBe(0)
    })

    it('should open preview at specific index', () => {
      useImagePreviewStore.getState().open(mockImages, 2)

      const state = useImagePreviewStore.getState()
      expect(state.currentIndex).toBe(2)
    })

    it('should default to index 0 if not specified', () => {
      useImagePreviewStore.getState().open(mockImages)

      expect(useImagePreviewStore.getState().currentIndex).toBe(0)
    })
  })

  describe('close', () => {
    it('should close preview but keep state for animation', () => {
      useImagePreviewStore.getState().open(mockImages, 1)
      useImagePreviewStore.getState().close()

      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(false)
      // State should be preserved for exit animation
      expect(state.images).toEqual(mockImages)
      expect(state.currentIndex).toBe(1)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      useImagePreviewStore.getState().open(mockImages, 1)
      useImagePreviewStore.getState().reset()

      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.images).toEqual([])
      expect(state.currentIndex).toBe(0)
    })
  })

  describe('setIndex', () => {
    beforeEach(() => {
      useImagePreviewStore.getState().open(mockImages)
    })

    it('should set valid index', () => {
      useImagePreviewStore.getState().setIndex(1)
      expect(useImagePreviewStore.getState().currentIndex).toBe(1)
    })

    it('should not set negative index', () => {
      useImagePreviewStore.getState().setIndex(-1)
      expect(useImagePreviewStore.getState().currentIndex).toBe(0)
    })

    it('should not set index beyond array length', () => {
      useImagePreviewStore.getState().setIndex(10)
      expect(useImagePreviewStore.getState().currentIndex).toBe(0)
    })

    it('should allow setting to last valid index', () => {
      useImagePreviewStore.getState().setIndex(2)
      expect(useImagePreviewStore.getState().currentIndex).toBe(2)
    })
  })

  /**
   * BUG regression: close() and reset() should be separate operations
   *
   * close() should only set isOpen to false, preserving state for exit animation.
   * reset() should be called after animation completes (via AnimatePresence onExitComplete).
   */
  describe('BUG: close vs reset separation', () => {
    it('close() should preserve currentIndex for animation', () => {
      useImagePreviewStore.getState().open(mockImages, 2)
      expect(useImagePreviewStore.getState().currentIndex).toBe(2)

      useImagePreviewStore.getState().close()

      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.currentIndex).toBe(2)
      expect(state.images).toEqual(mockImages)
    })

    it('reset() should clear all state after animation completes', () => {
      useImagePreviewStore.getState().open(mockImages, 2)
      useImagePreviewStore.getState().close()
      useImagePreviewStore.getState().reset()

      const state = useImagePreviewStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.currentIndex).toBe(0)
      expect(state.images).toEqual([])
    })
  })
})
