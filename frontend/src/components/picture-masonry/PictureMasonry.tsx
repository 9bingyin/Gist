import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { VirtuosoMasonry } from '@virtuoso.dev/masonry'
import { useEntriesInfinite, useUnreadCounts } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useMasonryColumn } from '@/hooks/useMasonryColumn'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { useImageDimensionsStore } from '@/stores/image-dimensions-store'
import { PictureItem } from './PictureItem'
import { EntryListHeader } from '@/components/entry-list/EntryListHeader'
import type { ContentType, Entry, Feed } from '@/types/api'

interface PictureMasonryProps {
  selection: SelectionType
  contentType: ContentType
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  isMobile?: boolean
  onMenuClick?: () => void
  isTablet?: boolean
  onToggleSidebar?: () => void
  sidebarVisible?: boolean
}

interface MasonryItem {
  entry: Entry
  feed?: Feed
}

interface MasonryContext {
  feedsMap: Map<string, Feed>
}

export function PictureMasonry({
  selection,
  contentType,
  unreadOnly,
  onToggleUnreadOnly,
  onMarkAllRead,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
}: PictureMasonryProps) {
  const { t } = useTranslation()
  const params = selectionToParams(selection, contentType)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Swipe gesture: Right swipe opens sidebar (only on mobile)
  useSwipeGesture(wrapperRef, {
    onSwipeRight: () => onMenuClick?.(),
    enabledDirections: ['right'],
    threshold: 100,
    preventScroll: true,
    enabled: Boolean(isMobile && onMenuClick),
  })

  // scrollContainerRef points to an overflow-hidden wrapper.
  // The actual scrollable element is a child: either VirtuosoMasonry's internal
  // scroller or the overflow-auto div used during loading/empty states.
  useEffect(() => {
    const handler = (e: Event) => {
      const eventScope = (e as CustomEvent<string | undefined>).detail
      if (eventScope && eventScope !== 'picture') return
      const container = scrollContainerRef.current
      if (!container) return
      // Find the first scrollable descendant
      for (const child of container.querySelectorAll('*')) {
        const { overflowY } = getComputedStyle(child)
        if (overflowY === 'auto' || overflowY === 'scroll') {
          ;(child as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
      }
    }
    window.addEventListener('scrolltotop', handler)
    return () => window.removeEventListener('scrolltotop', handler)
  }, [])

  const { containerRef, currentColumn, isReady } = useMasonryColumn(isMobile)
  const loadFromDB = useImageDimensionsStore((state) => state.loadFromDB)
  const clearFailed = useImageDimensionsStore((state) => state.clearFailed)

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

  // Generate a stable key representing the current filter context
  const virtuosoKey = useMemo(() => {
    const selectionKey =
      selection.type === 'feed'
        ? selection.feedId
        : selection.type === 'folder'
          ? selection.folderId
          : selection.type
    return `${selectionKey}-${unreadOnly}`
  }, [selection, unreadOnly])

  // Clear failed images on mount and when filter context changes,
  // giving images a fresh chance to load (failures are often transient)
  useEffect(() => {
    clearFailed()
  }, [virtuosoKey, clearFailed])

  // Load cached dimensions from IndexedDB
  useEffect(() => {
    const srcs = entries
      .map((entry) => entry.thumbnailUrl)
      .filter((url): url is string => !!url)
    if (srcs.length > 0) {
      loadFromDB(srcs)
    }
  }, [entries, loadFromDB])

  const items: MasonryItem[] = useMemo(() => {
    return entries.map((entry) => ({
      entry,
      feed: feedsMap.get(entry.feedId),
    }))
  }, [entries, feedsMap])

  const context: MasonryContext = useMemo(
    () => ({ feedsMap }),
    [feedsMap]
  )

  // Infinite scroll by listening to VirtuosoMasonry's internal scroll container
  useEffect(() => {
    const wrapper = scrollContainerRef.current
    if (!wrapper || !isReady) return

    let scrollEl: HTMLElement | null = null
    let observer: MutationObserver | null = null

    const handleScroll = () => {
      if (!scrollEl) return
      const { scrollTop, scrollHeight, clientHeight } = scrollEl
      if (scrollHeight - scrollTop - clientHeight < 300 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    const setupScrollListener = () => {
      // VirtuosoMasonry creates a div with overflow-y: scroll
      const scroller = wrapper.querySelector('[style*="overflow"]') as HTMLElement
      if (!scroller) return false

      scrollEl = scroller
      scroller.addEventListener('scroll', handleScroll, { passive: true })
      return true
    }

    // Try to find immediately
    if (!setupScrollListener()) {
      // If not found, use MutationObserver to wait for VirtuosoMasonry to render
      observer = new MutationObserver(() => {
        if (setupScrollListener() && observer) {
          observer.disconnect()
          observer = null
        }
      })
      observer.observe(wrapper, { childList: true, subtree: true })
    }

    return () => {
      observer?.disconnect()
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', handleScroll)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isReady])

  // Reset scroll on selection/filter change
  useEffect(() => {
    const wrapper = scrollContainerRef.current
    if (!wrapper) return
    const scroller = wrapper.querySelector('[style*="overflow"]') as HTMLElement
    if (scroller) {
      scroller.scrollTop = 0
    }
  }, [selection, unreadOnly])

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

  const ItemContent = useCallback(
    ({ data: item }: { data: MasonryItem; context: MasonryContext }) => {
      // Guard against undefined data during list refresh
      if (!item?.entry) return null
      return <PictureItem entry={item.entry} feed={item.feed} />
    },
    []
  )

  return (
    <div ref={wrapperRef} className="flex h-full flex-col">
      <EntryListHeader
        title={title}
        unreadCount={unreadCount}
        unreadOnly={unreadOnly}
        onToggleUnreadOnly={onToggleUnreadOnly}
        onMarkAllRead={onMarkAllRead}
        scrollToTopScope="picture"
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        isTablet={isTablet}
        onToggleSidebar={onToggleSidebar}
        sidebarVisible={sidebarVisible}
      />

      {/* Masonry container */}
      <div
        ref={(el) => {
          scrollContainerRef.current = el
          // eslint-disable-next-line react-hooks/immutability
          ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {isLoading ? (
          <div className="h-full overflow-auto p-4">
            <MasonrySkeleton />
          </div>
        ) : items.length === 0 ? (
          <div className="h-full overflow-auto p-4">
            <EmptyState />
          </div>
        ) : isReady ? (
          <VirtuosoMasonry
            key={virtuosoKey}
            data={items}
            columnCount={currentColumn}
            ItemContent={ItemContent}
            context={context}
            className="h-full p-4"
          />
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
