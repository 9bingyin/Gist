import { describe, it, expect, beforeEach } from 'vitest'
import { useLightboxStore } from './lightbox-store'
import type { Entry, Feed } from '@/types/api'

const mockEntry: Entry = {
  id: '1',
  feedId: '100',
  title: 'Test Entry',
  url: 'https://example.com/entry',
  content: '<p>Test content</p>',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  author: 'Test Author',
  publishedAt: '2024-01-15T10:00:00Z',
  read: false,
  starred: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
}

const mockFeed: Feed = {
  id: '100',
  title: 'Test Feed',
  url: 'https://example.com/feed.xml',
  siteUrl: 'https://example.com',
  type: 'article',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
}

const mockImages = [
  'https://example.com/img1.jpg',
  'https://example.com/img2.jpg',
  'https://example.com/img3.jpg',
]

describe('lightbox-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useLightboxStore.getState().reset()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.entry).toBeNull()
      expect(state.feed).toBeNull()
      expect(state.images).toEqual([])
      expect(state.currentIndex).toBe(0)
    })
  })

  describe('open', () => {
    it('should open lightbox with entry and images', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages)

      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(true)
      expect(state.entry).toEqual(mockEntry)
      expect(state.feed).toEqual(mockFeed)
      expect(state.images).toEqual(mockImages)
      expect(state.currentIndex).toBe(0)
    })

    it('should open lightbox at specific index', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 2)

      const state = useLightboxStore.getState()
      expect(state.currentIndex).toBe(2)
    })

    it('should handle undefined feed', () => {
      useLightboxStore.getState().open(mockEntry, undefined, mockImages)

      const state = useLightboxStore.getState()
      expect(state.feed).toBeNull()
    })
  })

  describe('close', () => {
    it('should close lightbox but keep state', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages)
      useLightboxStore.getState().close()

      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.entry).toEqual(mockEntry)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 1)
      useLightboxStore.getState().reset()

      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.entry).toBeNull()
      expect(state.feed).toBeNull()
      expect(state.images).toEqual([])
      expect(state.currentIndex).toBe(0)
    })
  })

  describe('setIndex', () => {
    beforeEach(() => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages)
    })

    it('should set valid index', () => {
      useLightboxStore.getState().setIndex(1)
      expect(useLightboxStore.getState().currentIndex).toBe(1)
    })

    it('should not set negative index', () => {
      useLightboxStore.getState().setIndex(-1)
      expect(useLightboxStore.getState().currentIndex).toBe(0)
    })

    it('should not set index beyond array length', () => {
      useLightboxStore.getState().setIndex(10)
      expect(useLightboxStore.getState().currentIndex).toBe(0)
    })
  })

  describe('next', () => {
    beforeEach(() => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages)
    })

    it('should go to next image', () => {
      useLightboxStore.getState().next()
      expect(useLightboxStore.getState().currentIndex).toBe(1)
    })

    it('should not go beyond last image', () => {
      useLightboxStore.getState().setIndex(2)
      useLightboxStore.getState().next()
      expect(useLightboxStore.getState().currentIndex).toBe(2)
    })
  })

  describe('prev', () => {
    beforeEach(() => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 2)
    })

    it('should go to previous image', () => {
      useLightboxStore.getState().prev()
      expect(useLightboxStore.getState().currentIndex).toBe(1)
    })

    it('should not go below first image', () => {
      useLightboxStore.getState().setIndex(0)
      useLightboxStore.getState().prev()
      expect(useLightboxStore.getState().currentIndex).toBe(0)
    })
  })

  describe('updateEntryStarred', () => {
    it('should update entry starred status', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages)
      useLightboxStore.getState().updateEntryStarred(true)

      const state = useLightboxStore.getState()
      expect(state.entry?.starred).toBe(true)
    })

    it('should do nothing if no entry', () => {
      useLightboxStore.getState().updateEntryStarred(true)
      expect(useLightboxStore.getState().entry).toBeNull()
    })
  })

  // BUG regression: #2853cd4 - close() should NOT reset state, only set isOpen to false
  describe('BUG #2853cd4: multi-image lightbox close behavior', () => {
    it('close() should preserve currentIndex for animation (was resetting to 0 causing flash)', () => {
      // Open lightbox at image index 2
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 2)
      expect(useLightboxStore.getState().currentIndex).toBe(2)

      // Close lightbox - should NOT reset index (animation needs current position)
      useLightboxStore.getState().close()

      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(false)
      // BUG: Before fix, close() would reset to index 0, causing flash to first image
      expect(state.currentIndex).toBe(2)
      expect(state.images).toEqual(mockImages)
    })

    it('reset() should clear all state after animation completes', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 2)
      useLightboxStore.getState().close()

      // After animation, call reset() to clear state
      useLightboxStore.getState().reset()

      const state = useLightboxStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.currentIndex).toBe(0)
      expect(state.images).toEqual([])
      expect(state.entry).toBeNull()
    })

    it('close() and reset() should be separate operations', () => {
      useLightboxStore.getState().open(mockEntry, mockFeed, mockImages, 1)

      // close() - only hides, preserves state for animation
      useLightboxStore.getState().close()
      expect(useLightboxStore.getState().isOpen).toBe(false)
      expect(useLightboxStore.getState().entry).not.toBeNull()

      // reset() - clears all state
      useLightboxStore.getState().reset()
      expect(useLightboxStore.getState().entry).toBeNull()
    })
  })
})
