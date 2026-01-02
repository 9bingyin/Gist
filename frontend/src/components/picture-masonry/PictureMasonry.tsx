import { useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MasonryInfiniteGrid } from '@egjs/react-infinitegrid'
import { useEntriesInfinite, useUnreadCounts } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useMasonryColumn } from '@/hooks/useMasonryColumn'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { PictureItem } from './PictureItem'
import { EntryListHeader } from '@/components/entry-list/EntryListHeader'
import type { ContentType, Feed } from '@/types/api'

interface PictureMasonryProps {
  selection: SelectionType
  contentType: ContentType
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  isMobile?: boolean
  onMenuClick?: () => void
}

const GUTTER = 16

export function PictureMasonry({
  selection,
  contentType,
  unreadOnly,
  onToggleUnreadOnly,
  onMarkAllRead,
  isMobile,
  onMenuClick,
}: PictureMasonryProps) {
  const { t } = useTranslation()
  const params = selectionToParams(selection, contentType)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { containerRef, currentColumn, currentItemWidth, isReady } = useMasonryColumn(
    GUTTER,
    isMobile
  )

  // Track scroll reset state with user interaction detection
  const scrollResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollResetActiveRef = useRef(false)
  const userHasScrolledRef = useRef(false)

  // Mark that we need to reset scroll when selection or filter changes
  useEffect(() => {
    const container = scrollContainerRef.current

    // Clear any existing timeout
    if (scrollResetTimeoutRef.current) {
      clearTimeout(scrollResetTimeoutRef.current)
    }

    // Reset state
    scrollResetActiveRef.current = true
    userHasScrolledRef.current = false

    // Immediately reset scroll to top
    if (container) {
      container.scrollTop = 0
    }

    // Detect user scroll interaction
    const handleUserScroll = () => {
      // Only count as user scroll if we've scrolled past a threshold
      if (container && container.scrollTop > 50) {
        userHasScrolledRef.current = true
      }
    }
    container?.addEventListener('scroll', handleUserScroll)

    // Disable scroll reset mode after 5 seconds
    scrollResetTimeoutRef.current = setTimeout(() => {
      scrollResetActiveRef.current = false
    }, 5000)

    return () => {
      if (scrollResetTimeoutRef.current) {
        clearTimeout(scrollResetTimeoutRef.current)
      }
      container?.removeEventListener('scroll', handleUserScroll)
    }
  }, [selection, unreadOnly])

  // Reset scroll on every render complete while scroll reset is active and user hasn't scrolled
  const handleRenderComplete = useCallback(() => {
    if (scrollResetActiveRef.current && !userHasScrolledRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [])

  const { data: feeds = [] } = useFeeds()
  const { data: folders = [] } = useFolders()
  const { data: unreadCounts } = useUnreadCounts()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useEntriesInfinite({
    ...params,
    unreadOnly,
    hasThumbnail: true,
  })

  const feedsMap = useMemo(() => {
    const map = new Map<string, Feed>()
    for (const feed of feeds) {
      map.set(feed.id, feed)
    }
    return map
  }, [feeds])

  const foldersMap = useMemo(() => {
    const map = new Map<string, { name: string }>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  const entries = useMemo(() => {
    return data?.pages.flatMap((page) => page.entries) ?? []
  }, [data])

  const items = useMemo(() => {
    return entries.map((entry, index) => ({
      entry,
      feed: feedsMap.get(entry.feedId),
      groupKey: Math.floor(index / 20),
    }))
  }, [entries, feedsMap])

  // Handle infinite scroll
  const handleRequestAppend = useCallback(
    (e: { groupKey?: string | number; wait: () => void; ready: () => void }) => {
      if (!hasNextPage || isFetchingNextPage) {
        return
      }
      e.wait()
      fetchNextPage().then(() => {
        e.ready()
      })
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  const title = useMemo(() => {
    switch (selection.type) {
      case 'all':
        return t('entry_list.all_pictures')
      case 'feed':
        return feedsMap.get(selection.feedId)?.title || t('entry_list.feed')
      case 'folder':
        return foldersMap.get(selection.folderId)?.name || t('entry_list.folder')
      case 'starred':
        return t('entry_list.starred')
    }
  }, [selection, feedsMap, foldersMap, t])

  const unreadCount = useMemo(() => {
    if (!unreadCounts) return 0
    const counts = unreadCounts.counts
    switch (selection.type) {
      case 'all':
        return feeds
          .filter((f) => f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0)
      case 'feed':
        return counts[selection.feedId] ?? 0
      case 'folder':
        return feeds
          .filter((f) => f.folderId === selection.folderId && f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0)
      case 'starred':
        return 0
    }
  }, [unreadCounts, selection, feeds, contentType])

  return (
    <div className="flex h-full flex-col">
      <EntryListHeader
        title={title}
        unreadCount={unreadCount}
        unreadOnly={unreadOnly}
        onToggleUnreadOnly={onToggleUnreadOnly}
        onMarkAllRead={onMarkAllRead}
        isMobile={isMobile}
        onMenuClick={onMenuClick}
      />

      {/* Scroll container */}
      <div
        ref={(el) => {
          scrollContainerRef.current = el
          ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className="min-h-0 flex-1 overflow-auto p-4"
      >
        {isLoading ? (
          <MasonrySkeleton />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : isReady ? (
          <MasonryInfiniteGrid
            key={`${selection.type}-${'feedId' in selection ? selection.feedId : 'folderId' in selection ? selection.folderId : ''}-${unreadOnly}`}
            gap={GUTTER}
            column={currentColumn}
            threshold={300}
            onRequestAppend={handleRequestAppend}
            onRenderComplete={handleRenderComplete}
            scrollContainer={scrollContainerRef.current}
            useResizeObserver
            observeChildren
          >
            {items.map((item) => (
              <PictureItem
                key={item.entry.id}
                data-grid-groupkey={item.groupKey}
                entry={item.entry}
                feed={item.feed}
                itemWidth={currentItemWidth}
              />
            ))}
          </MasonryInfiniteGrid>
        ) : null}

        {isFetchingNextPage && <LoadingMore />}
      </div>
    </div>
  )
}

function MasonrySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div
            className="bg-muted"
            style={{ height: 150 + (i % 3) * 50 }}
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="size-4 rounded bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      {t('entry_list.no_articles')}
    </div>
  )
}

function LoadingMore() {
  return (
    <div className="flex items-center justify-center py-8">
      <svg
        className="size-5 animate-spin text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  )
}
