import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { Entry } from '@/types/api'

// --- Hoisted mocks (available in vi.mock factories) ---
const {
  mockGetVirtualItems,
  mockTranslateArticlesBatch,
  mockCancelAllBatchTranslations,
} = vi.hoisted(() => ({
  mockGetVirtualItems: vi.fn(),
  mockTranslateArticlesBatch: vi.fn(() => Promise.resolve()),
  mockCancelAllBatchTranslations: vi.fn(),
}))

// --- Module mocks ---
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: mockGetVirtualItems,
    measureElement: () => {},
    getTotalSize: () => 500,
  }),
}))

vi.mock('@/hooks/useEntries', () => ({
  useEntriesInfinite: vi.fn(),
  useUnreadCounts: vi.fn(() => ({ data: undefined })),
}))

vi.mock('@/hooks/useFeeds', () => ({
  useFeeds: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/hooks/useFolders', () => ({
  useFolders: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/hooks/useAISettings', () => ({
  useAISettings: vi.fn(),
}))

vi.mock('@/hooks/useSelection', () => ({
  selectionToParams: vi.fn(() => ({})),
}))

vi.mock('@/lib/html-utils', () => ({
  stripHtml: (html: string) => html,
}))

vi.mock('@/lib/language-detect', () => ({
  needsTranslation: () => true,
}))

vi.mock('@/services/translation-service', () => ({
  translateArticlesBatch: mockTranslateArticlesBatch,
  cancelAllBatchTranslations: mockCancelAllBatchTranslations,
}))

vi.mock('@/stores/translation-store', () => ({
  translationActions: {
    isDisabled: () => false,
  },
}))

vi.mock('./EntryListItem', () => ({
  EntryListItem: () => null,
}))

vi.mock('./EntryListHeader', () => ({
  EntryListHeader: () => null,
}))

vi.mock('@radix-ui/react-scroll-area', () => {
  return {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Corner: () => null,
  }
})

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollBar: () => null,
}))

// --- Imports after mocks ---
import { EntryList } from './EntryList'
import { useEntriesInfinite } from '@/hooks/useEntries'
import { useAISettings } from '@/hooks/useAISettings'

// --- Helpers ---
function makeEntry(id: string): Entry {
  return {
    id,
    feedId: 'feed-1',
    title: `Title ${id}`,
    content: `<p>Content for entry ${id}</p>`,
    read: false,
    starred: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

const allEntries = ['1', '2', '3', '4', '5'].map(makeEntry)

// Virtualizer only shows entries at index 0 and 1
const visibleVirtualItems = [
  { index: 0, start: 0, size: 100, end: 100, lane: 0, key: 0 },
  { index: 1, start: 100, size: 100, end: 200, lane: 0, key: 1 },
]

const defaultProps = {
  selection: { type: 'all' as const },
  selectedEntryId: null as string | null,
  onSelectEntry: vi.fn(),
  onMarkAllRead: vi.fn(),
  unreadOnly: false,
  onToggleUnreadOnly: vi.fn(),
  contentType: 'article' as const,
}

// --- Tests ---
describe('EntryList translation scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    mockGetVirtualItems.mockReturnValue(visibleVirtualItems)

    vi.mocked(useEntriesInfinite).mockReturnValue({
      data: { pages: [{ entries: allEntries, hasMore: false }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    vi.mocked(useAISettings).mockReturnValue({
      data: { autoTranslate: true, summaryLanguage: 'zh-CN' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should schedule translation for selected entry outside visible range', () => {
    render(<EntryList {...defaultProps} selectedEntryId="4" />)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockTranslateArticlesBatch).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledArticles = (mockTranslateArticlesBatch.mock.calls[0] as any[])[0] as Array<{ id: string }>
    const ids = calledArticles.map((a) => a.id)
    expect(ids).toContain('4')
    expect(ids).toContain('1')
    expect(ids).toContain('2')
  })

  it('should not duplicate when selected entry is already visible', () => {
    render(<EntryList {...defaultProps} selectedEntryId="1" />)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockTranslateArticlesBatch).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledArticles = (mockTranslateArticlesBatch.mock.calls[0] as any[])[0] as Array<{ id: string }>
    const ids = calledArticles.map((a) => a.id)
    expect(ids.filter((id) => id === '1')).toHaveLength(1)
  })

  it('should only translate visible items when no entry is selected', () => {
    render(<EntryList {...defaultProps} selectedEntryId={null} />)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockTranslateArticlesBatch).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledArticles = (mockTranslateArticlesBatch.mock.calls[0] as any[])[0] as Array<{ id: string }>
    const ids = calledArticles.map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['1', '2']))
    expect(ids).not.toContain('3')
    expect(ids).not.toContain('4')
    expect(ids).not.toContain('5')
  })

  it('should not schedule any translation when autoTranslate is off', () => {
    vi.mocked(useAISettings).mockReturnValue({
      data: { autoTranslate: false, summaryLanguage: 'zh-CN' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<EntryList {...defaultProps} selectedEntryId="4" />)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockTranslateArticlesBatch).not.toHaveBeenCalled()
  })
})
