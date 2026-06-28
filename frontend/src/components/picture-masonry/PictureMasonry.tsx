import { useMemo, useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VirtuosoMasonry } from '@virtuoso.dev/masonry'
import { useEntriesInfinite, useUnreadCounts } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useMasonryColumn } from '@/hooks/useMasonryColumn'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { flattenUniqueEntries } from '@/lib/entry-pagination'
import { useImageDimensionsStore } from '@/stores/image-dimensions-store'
import { PictureItem } from './PictureItem'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'
import { useMasonryScrollMarkRead } from './useMasonryScrollMarkRead'
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

function getSelectionKey(selection: SelectionType): string {
  switch (selection.type) {
    case 'feed':
      return selection.feedId
    case 'folder':
      return selection.folderId
    case 'all':
    case 'starred':
      return selection.type
  }
}

function findScrollableElement(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null

  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  return candidates.find((element) => {
    const { overflowY } = getComputedStyle(element)
    return overflowY === 'auto' || overflowY === 'scroll'
  }) ?? null
}

function MasonryItemContent({ data: item }: { data: MasonryItem }) {
  if (!item?.entry) return null
  return (
    <div data-entry-id={item.entry.id}>
      <PictureItem entry={item.entry} feed={item.feed} />
    </div>
  )
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
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)

  // Swipe gesture: Right swipe opens sidebar (only on mobile)
  useSwipeGesture(wrapperRef, {
    onSwipeRight: () => onMenuClick?.(),
    enabledDirections: ['right'],
    threshold: 100,
    preventScroll: true,
    startFrom: { left: 64 },
    enabled: Boolean(isMobile && onMenuClick),
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const eventScope = (e as CustomEvent<string | undefined>).detail
      if (eventScope && eventScope !== 'picture') return
      const container = findScrollableElement(scrollContainerRef.current)
      if (!container) return
      container.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('scrolltotop', handler)
    return () => window.removeEventListener('scrolltotop', handler)
  }, [])

  const { currentColumn, isReady } = useMasonryColumn(isMobile, scrollContainerRef)
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
  const { data: generalSettings } = useGeneralSettings()
  const markReadOnScroll = generalSettings?.markReadOnScroll ?? false

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

  const entries = useMemo(() => flattenUniqueEntries(data?.pages), [data])

  const filterKey = useMemo(
    () => `${getSelectionKey(selection)}-${unreadOnly}`,
    [selection, unreadOnly]
  )

  // Clear failed images on mount and when filter context changes,
  // giving images a fresh chance to load (failures are often transient)
  useEffect(() => {
    clearFailed()
  }, [filterKey, clearFailed])

  // Load cached dimensions from IndexedDB
  useEffect(() => {
    const srcs = entries
      .map((entry) => entry.thumbnailUrl)
      .filter((url): url is string => !!url)
    if (srcs.length > 0) {
      loadFromDB(srcs)
    }
  }, [entries, loadFromDB])

  const items: MasonryItem[] = useMemo(
    () => entries.map((entry) => ({
      entry,
      feed: feedsMap.get(entry.feedId),
    })),
    [entries, feedsMap]
  )

  // Infinite scroll by listening to VirtuosoMasonry's internal scroll container.
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
      const nextScrollEl = findScrollableElement(wrapper)
      if (!nextScrollEl || nextScrollEl === scrollEl) return Boolean(scrollEl)

      scrollEl?.removeEventListener('scroll', handleScroll)
      scrollEl = nextScrollEl
      setScrollElement(nextScrollEl)
      scrollEl.addEventListener('scroll', handleScroll, { passive: true })
      return true
    }

    if (!setupScrollListener()) {
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
      scrollEl?.removeEventListener('scroll', handleScroll)
      setScrollElement((current) => (current === scrollEl ? null : current))
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isReady])

  // Reset scroll on selection/filter change
  useEffect(() => {
    const scrollEl = findScrollableElement(scrollContainerRef.current)
    if (!scrollEl) return
    scrollEl.scrollTop = 0
  }, [selection, unreadOnly])

  const { endPaddingHeight: scrollReadEndPaddingHeight } = useMasonryScrollMarkRead({
    scrollElement,
    entries,
    enabled: markReadOnScroll,
    unreadOnly,
    hasNextPage: Boolean(hasNextPage),
    resetKey: `${filterKey}\u0000${markReadOnScroll}`,
  })
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

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-hidden [overflow-anchor:none]"
      >
        {isLoading ? (
          <div className="h-full overflow-auto p-4">
            <MasonrySkeleton />
          </div>
        ) : entries.length === 0 ? (
          <div className="h-full overflow-auto p-4">
            <EmptyState />
          </div>
        ) : isReady ? (
          <VirtuosoMasonry
            key={filterKey}
            data={items}
            columnCount={currentColumn}
            ItemContent={MasonryItemContent}
            className="h-full p-4"
            style={{ paddingBottom: scrollReadEndPaddingHeight || undefined }}
          />
        ) : null}
        {isFetchingNextPage && <LoadingMore />}
      </div>
    </div>
  )
}

function MasonrySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
