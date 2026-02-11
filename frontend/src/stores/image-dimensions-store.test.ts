import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useImageDimensionsStore } from './image-dimensions-store'

// Mock the image-dimensions-db module
vi.mock('@/lib/image-dimensions-db', () => ({
  getDimensionsBatch: vi.fn(),
  saveDimension: vi.fn(),
}))

describe('image-dimensions-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useImageDimensionsStore.setState({
      dimensions: {},
      failedImages: new Set(),
      isLoading: false,
    })
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useImageDimensionsStore.getState()
      expect(state.dimensions).toEqual({})
      expect(state.failedImages).toEqual(new Set())
      expect(state.isLoading).toBe(false)
    })
  })

  describe('getDimension', () => {
    it('should return undefined for non-existent src', () => {
      const dim = useImageDimensionsStore.getState().getDimension('nonexistent')
      expect(dim).toBeUndefined()
    })

    it('should return dimension for existing src', () => {
      useImageDimensionsStore.setState({
        dimensions: {
          'https://example.com/img.jpg': {
            src: 'https://example.com/img.jpg',
            width: 800,
            height: 600,
            ratio: 800 / 600,
          },
        },
      })

      const dim = useImageDimensionsStore.getState().getDimension('https://example.com/img.jpg')
      expect(dim).toEqual({
        src: 'https://example.com/img.jpg',
        width: 800,
        height: 600,
        ratio: 800 / 600,
      })
    })
  })

  describe('setDimension', () => {
    it('should set dimension for src', () => {
      useImageDimensionsStore.getState().setDimension('https://example.com/img.jpg', 1920, 1080)

      const state = useImageDimensionsStore.getState()
      expect(state.dimensions['https://example.com/img.jpg']).toEqual({
        src: 'https://example.com/img.jpg',
        width: 1920,
        height: 1080,
        ratio: 1920 / 1080,
      })
    })

    it('should calculate correct aspect ratio', () => {
      useImageDimensionsStore.getState().setDimension('https://example.com/square.jpg', 500, 500)

      const dim = useImageDimensionsStore.getState().getDimension('https://example.com/square.jpg')
      expect(dim?.ratio).toBe(1)
    })

    it('should overwrite existing dimension', () => {
      useImageDimensionsStore.getState().setDimension('https://example.com/img.jpg', 100, 100)
      useImageDimensionsStore.getState().setDimension('https://example.com/img.jpg', 200, 100)

      const dim = useImageDimensionsStore.getState().getDimension('https://example.com/img.jpg')
      expect(dim?.width).toBe(200)
      expect(dim?.ratio).toBe(2)
    })

    it('should not affect other dimensions', () => {
      useImageDimensionsStore.getState().setDimension('https://example.com/img1.jpg', 100, 100)
      useImageDimensionsStore.getState().setDimension('https://example.com/img2.jpg', 200, 100)

      const dim1 = useImageDimensionsStore.getState().getDimension('https://example.com/img1.jpg')
      const dim2 = useImageDimensionsStore.getState().getDimension('https://example.com/img2.jpg')
      expect(dim1?.width).toBe(100)
      expect(dim2?.width).toBe(200)
    })
  })

  describe('markFailed', () => {
    it('should mark image as failed', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')

      const state = useImageDimensionsStore.getState()
      expect(state.failedImages.has('https://example.com/broken.jpg')).toBe(true)
    })

    it('should handle marking same image multiple times', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')

      const state = useImageDimensionsStore.getState()
      expect(state.failedImages.size).toBe(1)
    })

    it('should mark multiple different images as failed', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/broken1.jpg')
      useImageDimensionsStore.getState().markFailed('https://example.com/broken2.jpg')
      useImageDimensionsStore.getState().markFailed('https://example.com/broken3.jpg')

      const state = useImageDimensionsStore.getState()
      expect(state.failedImages.size).toBe(3)
      expect(state.failedImages.has('https://example.com/broken1.jpg')).toBe(true)
      expect(state.failedImages.has('https://example.com/broken2.jpg')).toBe(true)
      expect(state.failedImages.has('https://example.com/broken3.jpg')).toBe(true)
    })
  })

  describe('isFailed', () => {
    it('should return false for non-failed image', () => {
      const result = useImageDimensionsStore.getState().isFailed('https://example.com/good.jpg')
      expect(result).toBe(false)
    })

    it('should return true for failed image', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')

      const result = useImageDimensionsStore.getState().isFailed('https://example.com/broken.jpg')
      expect(result).toBe(true)
    })
  })

  describe('loadFromDB', () => {
    it('should not load if srcs array is empty', async () => {
      await useImageDimensionsStore.getState().loadFromDB([])

      const state = useImageDimensionsStore.getState()
      expect(state.isLoading).toBe(false)
    })

    it('should set isLoading during load', async () => {
      const { getDimensionsBatch } = await import('@/lib/image-dimensions-db')
      vi.mocked(getDimensionsBatch).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Map()), 100))
      )

      const loadPromise = useImageDimensionsStore.getState().loadFromDB(['src1'])
      expect(useImageDimensionsStore.getState().isLoading).toBe(true)

      await loadPromise
      expect(useImageDimensionsStore.getState().isLoading).toBe(false)
    })

    it('should merge loaded dimensions with existing ones', async () => {
      const { getDimensionsBatch } = await import('@/lib/image-dimensions-db')
      const mockDimensions = new Map([
        ['https://example.com/img1.jpg', { src: 'https://example.com/img1.jpg', width: 100, height: 100, ratio: 1 }],
      ])
      vi.mocked(getDimensionsBatch).mockResolvedValue(mockDimensions)

      // Set existing dimension
      useImageDimensionsStore.getState().setDimension('https://example.com/existing.jpg', 50, 50)

      await useImageDimensionsStore.getState().loadFromDB(['https://example.com/img1.jpg'])

      const state = useImageDimensionsStore.getState()
      expect(state.dimensions['https://example.com/existing.jpg']).toBeDefined()
      expect(state.dimensions['https://example.com/img1.jpg']).toBeDefined()
    })
  })

  describe('clearFailed', () => {
    it('should clear all failed images', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/broken1.jpg')
      useImageDimensionsStore.getState().markFailed('https://example.com/broken2.jpg')

      expect(useImageDimensionsStore.getState().failedImages.size).toBe(2)

      useImageDimensionsStore.getState().clearFailed()

      const state = useImageDimensionsStore.getState()
      expect(state.failedImages.size).toBe(0)
      expect(state.isFailed('https://example.com/broken1.jpg')).toBe(false)
      expect(state.isFailed('https://example.com/broken2.jpg')).toBe(false)
    })

    it('should not affect cached dimensions', () => {
      useImageDimensionsStore.getState().setDimension('https://example.com/img.jpg', 800, 600)
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')

      useImageDimensionsStore.getState().clearFailed()

      const state = useImageDimensionsStore.getState()
      expect(state.dimensions['https://example.com/img.jpg']).toBeDefined()
      expect(state.dimensions['https://example.com/img.jpg']?.width).toBe(800)
    })

    it('should allow previously failed images to be retried', () => {
      useImageDimensionsStore.getState().markFailed('https://example.com/img.jpg')
      expect(useImageDimensionsStore.getState().isFailed('https://example.com/img.jpg')).toBe(true)

      useImageDimensionsStore.getState().clearFailed()
      expect(useImageDimensionsStore.getState().isFailed('https://example.com/img.jpg')).toBe(false)

      // Can be marked failed again if it still fails on retry
      useImageDimensionsStore.getState().markFailed('https://example.com/img.jpg')
      expect(useImageDimensionsStore.getState().isFailed('https://example.com/img.jpg')).toBe(true)
    })

    it('should be a no-op on empty set', () => {
      const stateBefore = useImageDimensionsStore.getState()
      expect(stateBefore.failedImages.size).toBe(0)

      useImageDimensionsStore.getState().clearFailed()

      const stateAfter = useImageDimensionsStore.getState()
      expect(stateAfter.failedImages.size).toBe(0)
    })
  })

  // BUG regression: iOS PWA - failed images being repeatedly loaded
  describe('BUG: iOS PWA failed image repeated loading', () => {
    it('markFailed should persist across component remounts (simulated by state access)', () => {
      // Simulate first mount: image fails to load
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')
      expect(useImageDimensionsStore.getState().isFailed('https://example.com/broken.jpg')).toBe(true)

      // Simulate component unmount (virtual list scroll away) - state persists in store

      // Simulate second mount (scroll back) - should still be marked as failed
      expect(useImageDimensionsStore.getState().isFailed('https://example.com/broken.jpg')).toBe(true)
    })

    it('failedImages Set should maintain state independent of component lifecycle', () => {
      // Mark multiple images as failed (simulating scroll through list)
      useImageDimensionsStore.getState().markFailed('https://example.com/img1.jpg')
      useImageDimensionsStore.getState().markFailed('https://example.com/img2.jpg')

      // Get fresh state reference (simulating new component instance)
      const freshState = useImageDimensionsStore.getState()
      expect(freshState.isFailed('https://example.com/img1.jpg')).toBe(true)
      expect(freshState.isFailed('https://example.com/img2.jpg')).toBe(true)
      expect(freshState.isFailed('https://example.com/img3.jpg')).toBe(false)
    })

    it('failed state should be checked before attempting to load image', () => {
      // Mark image as failed
      useImageDimensionsStore.getState().markFailed('https://example.com/broken.jpg')

      // Simulate PictureItem logic: check isFailed before rendering
      const thumbnailUrl = 'https://example.com/broken.jpg'
      const isFailed = useImageDimensionsStore.getState().isFailed(thumbnailUrl)

      // Component should return null (not render) if isFailed is true
      expect(isFailed).toBe(true)
      // In real component: if (!thumbnailUrl || isFailed) return null
    })
  })
})
