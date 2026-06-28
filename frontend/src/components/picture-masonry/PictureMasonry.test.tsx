import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, screen } from '@testing-library/react'
import type { Entry } from '@/types/api'

const {
  mockMarkManyAsRead,
  mockRemoveFromUnreadList,
  mockFetchNextPage,
  mockVisibleEntryCount,
} = vi.hoisted(() => ({
  mockMarkManyAsRead: vi.fn(),
  mockRemoveFromUnreadList: vi.fn(),
  mockFetchNextPage: vi.fn(),
  mockVisibleEntryCount: { value: Number.POSITIVE_INFINITY },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@virtuoso.dev/masonry', () => ({
  VirtuosoMasonry: ({ data, ItemContent, className, style }: {
    data: Array<{ entry: Entry }>
    ItemContent: React.ComponentType<{ data: { entry: Entry }; index: number; context?: unknown }>
    className?: string
    style?: React.CSSProperties
  }) => (
    <div
      data-testid="picture-masonry-scroll"
      className={className}
      style={{ overflowY: 'auto', height: 400, ...style }}
    >
      {data.slice(0, mockVisibleEntryCount.value).map((item, index) => (
        <ItemContent key={item.entry.id} data={item} index={index} />
      ))}
    </div>
  ),
}))

vi.mock('@/hooks/useEntries', () => ({
  useEntriesInfinite: vi.fn(),
  useUnreadCounts: vi.fn(() => ({ data: undefined })),
  useMarkManyAsRead: vi.fn(() => ({ mutate: mockMarkManyAsRead })),
  useRemoveFromUnreadList: vi.fn(() => mockRemoveFromUnreadList),
}))

vi.mock('@/hooks/useFeeds', () => ({
  useFeeds: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/hooks/useFolders', () => ({
  useFolders: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/hooks/useGeneralSettings', () => ({
  useGeneralSettings: vi.fn(() => ({ data: { markReadOnScroll: false } })),
}))

vi.mock('@/hooks/useMasonryColumn', () => ({
  useMasonryColumn: vi.fn(() => ({ currentColumn: 2, isReady: true })),
}))

vi.mock('@/hooks/useSelection', () => ({
  selectionToParams: vi.fn(() => ({})),
}))

vi.mock('@/hooks/useSwipeGesture', () => ({
  useSwipeGesture: vi.fn(),
}))

vi.mock('@/stores/image-dimensions-store', () => ({
  useImageDimensionsStore: vi.fn((selector: (state: { loadFromDB: () => void; clearFailed: () => void }) => unknown) =>
    selector({ loadFromDB: vi.fn(), clearFailed: vi.fn() })
  ),
}))

vi.mock('./PictureItem', () => ({
  PictureItem: ({ entry }: { entry: Entry }) => <div data-testid={`picture-item-${entry.id}`}>{entry.title}</div>,
}))

vi.mock('@/components/entry-list/EntryListHeader', () => ({
  EntryListHeader: () => null,
}))

import { PictureMasonry } from './PictureMasonry'
import { useEntriesInfinite } from '@/hooks/useEntries'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'

function makeEntry(id: string, read = false): Entry {
  return {
    id,
    feedId: 'feed-1',
    title: `Title ${id}`,
    content: `<p>Content ${id}</p>`,
    thumbnailUrl: `https://example.com/${id}.jpg`,
    read,
    starred: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

const entries = ['1', '2', '3'].map((id) => makeEntry(id))
const defaultProps = {
  selection: { type: 'all' as const },
  contentType: 'picture' as const,
  unreadOnly: false,
  onToggleUnreadOnly: vi.fn(),
  onMarkAllRead: vi.fn(),
}

function mockEntries(nextEntries: Entry[] = entries) {
  vi.mocked(useEntriesInfinite).mockReturnValue({
    data: { pages: [{ entries: nextEntries, hasMore: false }] },
    fetchNextPage: mockFetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function installScrollMarkObserver({ leaveFromTop = true, enterOnly = false }: { leaveFromTop?: boolean; enterOnly?: boolean } = {}) {
  globalThis.IntersectionObserver = class {
    private callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
    }

    observe = (target: Element) => {
      const element = target as HTMLElement
      if (!element.dataset.entryId) return

      element.getBoundingClientRect = () => ({
        x: 0,
        y: leaveFromTop ? -40 : 120,
        width: 160,
        height: 40,
        top: leaveFromTop ? -40 : 120,
        bottom: leaveFromTop ? 0 : 160,
        left: 0,
        right: 160,
        toJSON: () => ({}),
      })

      const items = [{ isIntersecting: true, target: element } as unknown as IntersectionObserverEntry]
      if (!enterOnly) {
        items.push({
          isIntersecting: false,
          target: element,
          boundingClientRect: { bottom: leaveFromTop ? 0 : 160 },
          rootBounds: { top: 10 },
        } as unknown as IntersectionObserverEntry)
      }

      this.callback(items, this as unknown as IntersectionObserver)
    }

    disconnect = vi.fn()
    unobserve = vi.fn()
    takeRecords = () => []
    root = null
    rootMargin = ''
    thresholds = []
  } as unknown as typeof IntersectionObserver
}

function installGraceOnlyScrollMarkObserver() {
  const installedAt = Date.now()
  globalThis.IntersectionObserver = class {
    private callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
    }

    observe = (target: Element) => {
      const element = target as HTMLElement
      if (!element.dataset.entryId || Date.now() - installedAt >= 1000) return

      element.getBoundingClientRect = () => ({
        x: 0,
        y: -40,
        width: 160,
        height: 40,
        top: -40,
        bottom: 0,
        left: 0,
        right: 160,
        toJSON: () => ({}),
      })

      this.callback(
        [
          { isIntersecting: true, target: element } as unknown as IntersectionObserverEntry,
          {
            isIntersecting: false,
            target: element,
            boundingClientRect: { bottom: 0 },
            rootBounds: { top: 10 },
          } as unknown as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      )
    }

    disconnect = vi.fn()
    unobserve = vi.fn()
    takeRecords = () => []
    root = null
    rootMargin = ''
    thresholds = []
  } as unknown as typeof IntersectionObserver
}

async function flushMarkReadBatch() {
  await act(async () => {
    vi.advanceTimersByTime(1000)
    await Promise.resolve()
  })
  await act(async () => {
    vi.advanceTimersByTime(200)
    await Promise.resolve()
  })
}

describe('PictureMasonry scroll mark read', () => {
  let originalIntersectionObserver: typeof IntersectionObserver | undefined
  let originalResizeObserver: typeof ResizeObserver | undefined
  let originalMutationObserver: typeof MutationObserver | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    originalIntersectionObserver = globalThis.IntersectionObserver
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver
    originalMutationObserver = globalThis.MutationObserver
    mockVisibleEntryCount.value = Number.POSITIVE_INFINITY
    mockEntries()
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  afterEach(() => {
    cleanup()
    globalThis.IntersectionObserver = originalIntersectionObserver!
    globalThis.ResizeObserver = originalResizeObserver!
    globalThis.MutationObserver = originalMutationObserver!
    vi.useRealTimers()
  })

  it('开启滚动标已读后，图片项滚出顶部时批量标为已读', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).toHaveBeenCalledWith(
      { ids: ['1', '2', '3'], read: true, skipInvalidate: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    )
  })

  it('关闭滚动标已读时不会触发标记', async () => {
    installScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).not.toHaveBeenCalled()
  })

  it('已读图片项不会被滚动标记', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockEntries([makeEntry('1', true)])
    installScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).not.toHaveBeenCalled()
  })

  it('图片项从底部离开可视区时不会标为已读', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installScrollMarkObserver({ leaveFromTop: false })

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).not.toHaveBeenCalled()
  })

  it('图片项只进入可视区但未滚出时不会标为已读', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installScrollMarkObserver({ enterOnly: true })

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).not.toHaveBeenCalled()
  })

  it('会通过 MutationObserver 观察虚拟列表后续挂载的图片项', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    let mutationCallback: MutationCallback | undefined
    globalThis.MutationObserver = class {
      constructor(callback: MutationCallback) {
        mutationCallback = callback
      }

      observe = vi.fn()
      disconnect = vi.fn()
      takeRecords = () => []
    } as unknown as typeof MutationObserver
    installScrollMarkObserver()
    mockVisibleEntryCount.value = 1

    const { rerender } = render(<PictureMasonry {...defaultProps} unreadOnly />)
    await flushMarkReadBatch()
    mockMarkManyAsRead.mockClear()

    mockVisibleEntryCount.value = 2
    rerender(<PictureMasonry {...defaultProps} unreadOnly />)
    await act(async () => {
      mutationCallback?.([], {} as MutationObserver)
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })

    expect(mockMarkManyAsRead).toHaveBeenCalledWith(
      { ids: ['2'], read: true, skipInvalidate: true },
      expect.any(Object)
    )
  })

  it('列表数据变化后的静默窗口内不会滚动标已读', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await act(async () => {
      vi.advanceTimersByTime(999)
      await Promise.resolve()
    })
    expect(mockMarkManyAsRead).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })

    expect(mockMarkManyAsRead).toHaveBeenCalled()
  })

  it('静默窗口内发生的首次滚动会在窗口结束后标已读', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installGraceOnlyScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()

    expect(mockMarkManyAsRead).toHaveBeenCalledWith(
      { ids: ['1', '2', '3'], read: true, skipInvalidate: true },
      expect.any(Object)
    )
  })

  it('unreadOnly 移除已读图片项', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    installScrollMarkObserver()

    render(<PictureMasonry {...defaultProps} unreadOnly />)

    await flushMarkReadBatch()
    const firstCallOptions = mockMarkManyAsRead.mock.calls[0]?.[1] as { onSuccess?: () => void } | undefined
    firstCallOptions?.onSuccess?.()

    expect(mockRemoveFromUnreadList).toHaveBeenCalledWith(new Set(['1', '2', '3']))
  })

  it('unreadOnly 移除已读图片项后会按可视 anchor 补偿 scrollTop', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    let secondTop = 80
    globalThis.IntersectionObserver = class {
      private callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe = (target: Element) => {
        const element = target as HTMLElement
        const entryId = element.dataset.entryId
        if (!entryId) return

        element.getBoundingClientRect = () => {
          const top = entryId === '1' ? -40 : entryId === '2' ? secondTop : 160
          return {
            x: 0,
            y: top,
            width: 160,
            height: 40,
            top,
            bottom: top + 40,
            left: 0,
            right: 160,
            toJSON: () => ({}),
          }
        }

        const items = [{ isIntersecting: true, target: element } as unknown as IntersectionObserverEntry]
        if (entryId === '1') {
          items.push({
            isIntersecting: false,
            target: element,
            boundingClientRect: { bottom: 0 },
            rootBounds: { top: 10 },
          } as unknown as IntersectionObserverEntry)
        }
        this.callback(items, this as unknown as IntersectionObserver)
      }

      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = () => []
      root = null
      rootMargin = ''
      thresholds = []
    } as unknown as typeof IntersectionObserver
    const requestAnimationFrameMock = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      })

    render(<PictureMasonry {...defaultProps} unreadOnly />)
    const scroll = screen.getByTestId('picture-masonry-scroll')
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, writable: true, value: 100 })
    scroll.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 320,
      height: 400,
      top: 0,
      bottom: 400,
      left: 0,
      right: 320,
      toJSON: () => ({}),
    })

    await flushMarkReadBatch()
    const firstCallOptions = mockMarkManyAsRead.mock.calls[0]?.[1] as { onSuccess?: () => void } | undefined
    secondTop = 50
    firstCallOptions?.onSuccess?.()

    expect(scroll.scrollTop).toBe(70)
    requestAnimationFrameMock.mockRestore()
  })

  it('滚动标已读底部填充只在自然内容溢出时使用图片墙滚动容器高度', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const previousClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    const previousScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')

    try {
      Object.defineProperties(HTMLElement.prototype, {
        clientHeight: {
          configurable: true,
          get() {
            return this instanceof HTMLElement && this.dataset.testid === 'picture-masonry-scroll' ? 320 : 0
          },
        },
        scrollHeight: {
          configurable: true,
          get() {
            return this instanceof HTMLElement && this.dataset.testid === 'picture-masonry-scroll' ? 480 : 0
          },
        },
      })

      render(<PictureMasonry {...defaultProps} />)
      await act(async () => {
        await Promise.resolve()
      })

      expect(screen.getByTestId('picture-masonry-scroll').style.paddingBottom).toBe('320px')
    } finally {
      if (previousClientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', previousClientHeight)
      } else {
        delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
      }
      if (previousScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', previousScrollHeight)
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
      }
    }
  })

  it('滚动标已读不会给短图片列表额外制造滚动条', async () => {
    vi.mocked(useGeneralSettings).mockReturnValue({
      data: { markReadOnScroll: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockEntries([makeEntry('1'), makeEntry('2')])
    const previousClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    const previousScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')

    try {
      Object.defineProperties(HTMLElement.prototype, {
        clientHeight: {
          configurable: true,
          get() {
            return this instanceof HTMLElement && this.dataset.testid === 'picture-masonry-scroll' ? 320 : 0
          },
        },
        scrollHeight: {
          configurable: true,
          get() {
            return this instanceof HTMLElement && this.dataset.testid === 'picture-masonry-scroll' ? 220 : 0
          },
        },
      })

      render(<PictureMasonry {...defaultProps} />)
      await act(async () => {
        await Promise.resolve()
      })

      expect(screen.getByTestId('picture-masonry-scroll').style.paddingBottom).toBe('')
    } finally {
      if (previousClientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', previousClientHeight)
      } else {
        delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
      }
      if (previousScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', previousScrollHeight)
      } else {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
      }
    }
  })
})
