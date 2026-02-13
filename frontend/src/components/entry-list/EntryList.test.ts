import { describe, it, expect, beforeEach } from 'vitest'
import {
  selectionScrollKey,
  entryListScrollPositions,
  entryListMeasurementsCache,
} from './scroll-key'
import type { SelectionType } from '@/hooks/useSelection'
import type { ContentType } from '@/types/api'
import type { VirtualItem } from '@tanstack/react-virtual'

describe('selectionScrollKey', () => {
  const contentTypes: ContentType[] = ['article', 'picture', 'notification']

  it('should generate unique key for "all" selection per contentType', () => {
    const selection: SelectionType = { type: 'all' }
    const keys = contentTypes.map((ct) => selectionScrollKey(selection, ct))

    expect(keys[0]).toBe('all:article')
    expect(keys[1]).toBe('all:picture')
    expect(keys[2]).toBe('all:notification')
    // All keys are unique
    expect(new Set(keys).size).toBe(3)
  })

  it('should generate unique key for "feed" selection per feedId and contentType', () => {
    const selectionA: SelectionType = { type: 'feed', feedId: '100' }
    const selectionB: SelectionType = { type: 'feed', feedId: '200' }

    expect(selectionScrollKey(selectionA, 'article')).toBe('feed:100:article')
    expect(selectionScrollKey(selectionB, 'article')).toBe('feed:200:article')
    expect(selectionScrollKey(selectionA, 'picture')).toBe('feed:100:picture')

    // Different feedId or contentType produces different key
    expect(selectionScrollKey(selectionA, 'article')).not.toBe(
      selectionScrollKey(selectionB, 'article')
    )
    expect(selectionScrollKey(selectionA, 'article')).not.toBe(
      selectionScrollKey(selectionA, 'picture')
    )
  })

  it('should generate unique key for "folder" selection per folderId and contentType', () => {
    const selection: SelectionType = { type: 'folder', folderId: '300' }

    expect(selectionScrollKey(selection, 'article')).toBe('folder:300:article')
    expect(selectionScrollKey(selection, 'notification')).toBe('folder:300:notification')
  })

  it('should generate unique key for "starred" selection per contentType', () => {
    const selection: SelectionType = { type: 'starred' }

    expect(selectionScrollKey(selection, 'article')).toBe('starred:article')
    expect(selectionScrollKey(selection, 'picture')).toBe('starred:picture')
  })

  it('should produce different keys across different selection types', () => {
    const ct: ContentType = 'article'
    const keys = [
      selectionScrollKey({ type: 'all' }, ct),
      selectionScrollKey({ type: 'feed', feedId: 'all' }, ct),
      selectionScrollKey({ type: 'folder', folderId: 'all' }, ct),
      selectionScrollKey({ type: 'starred' }, ct),
    ]

    expect(new Set(keys).size).toBe(4)
  })
})

// Regression: scroll positions must survive unmount/remount and stay isolated per key.
// This covers the bug where switching to picture mode (EntryList unmounts) and back
// caused article/notification scroll positions to be lost.
describe('scroll position caches across unmount/remount', () => {
  beforeEach(() => {
    entryListScrollPositions.clear()
    entryListMeasurementsCache.clear()
  })

  it('should preserve scroll position after cache is populated (simulates unmount/remount)', () => {
    const key = selectionScrollKey({ type: 'all' }, 'article')

    // Simulate: user scrolls, scroll listener saves offset
    entryListScrollPositions.set(key, 1500)

    // Simulate: component unmounts (picture mode), then remounts.
    // On remount, virtualizer reads initialOffset from cache.
    expect(entryListScrollPositions.get(key)).toBe(1500)
  })

  it('should isolate scroll positions between content types', () => {
    const articleKey = selectionScrollKey({ type: 'all' }, 'article')
    const notificationKey = selectionScrollKey({ type: 'all' }, 'notification')

    entryListScrollPositions.set(articleKey, 800)
    entryListScrollPositions.set(notificationKey, 2000)

    // Each type retains its own position
    expect(entryListScrollPositions.get(articleKey)).toBe(800)
    expect(entryListScrollPositions.get(notificationKey)).toBe(2000)

    // Picture key was never saved, returns undefined (virtualizer defaults to 0)
    const pictureKey = selectionScrollKey({ type: 'all' }, 'picture')
    expect(entryListScrollPositions.get(pictureKey)).toBeUndefined()
  })

  it('should isolate scroll positions between different feeds of the same type', () => {
    const feedA = selectionScrollKey({ type: 'feed', feedId: '10' }, 'article')
    const feedB = selectionScrollKey({ type: 'feed', feedId: '20' }, 'article')

    entryListScrollPositions.set(feedA, 500)
    entryListScrollPositions.set(feedB, 3000)

    expect(entryListScrollPositions.get(feedA)).toBe(500)
    expect(entryListScrollPositions.get(feedB)).toBe(3000)
  })

  it('should preserve measurements cache across unmount/remount', () => {
    const key = selectionScrollKey({ type: 'all' }, 'article')
    const measurements = [
      { index: 0, start: 0, end: 95, size: 95, key: '0', lane: 0 },
      { index: 1, start: 95, end: 205, size: 110, key: '1', lane: 0 },
      { index: 2, start: 205, end: 300, size: 95, key: '2', lane: 0 },
    ] as VirtualItem[]

    // Simulate: onChange saves measurements when scrolling stops
    entryListMeasurementsCache.set(key, measurements)

    // Simulate: remount reads cache for initialMeasurementsCache
    const restored = entryListMeasurementsCache.get(key)
    expect(restored).toBe(measurements)
    expect(restored).toHaveLength(3)
    expect(restored![1].size).toBe(110)
  })

  it('should not leak measurements between content types', () => {
    const articleKey = selectionScrollKey({ type: 'all' }, 'article')
    const notificationKey = selectionScrollKey({ type: 'all' }, 'notification')

    const articleMeasurements = [
      { index: 0, start: 0, end: 100, size: 100, key: '0', lane: 0 },
    ] as VirtualItem[]

    entryListMeasurementsCache.set(articleKey, articleMeasurements)

    expect(entryListMeasurementsCache.get(articleKey)).toBe(articleMeasurements)
    expect(entryListMeasurementsCache.get(notificationKey)).toBeUndefined()
  })
})
