import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntriesInfinite, useMarkAsRead, useRemoveFromUnreadList, useUnreadCounts } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useAISettings } from '@/hooks/useAISettings'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { stripHtml } from '@/lib/html-utils'
import { cn } from '@/lib/utils'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { ScrollBar } from '@/components/ui/scroll-area'
import { EntryListItem } from './EntryListItem'
import { EntryListHeader } from './EntryListHeader'
import { needsTranslation } from '@/lib/language-detect'
import { translateArticlesBatch, cancelAllBatchTranslations } from '@/services/translation-service'
import { translationActions } from '@/stores/translation-store'
import { selectionScrollKey, entryListScrollPositions, entryListMeasurementsCache } from './scroll-key'
import { useScrollToTop } from '@/hooks/useScrollToTop'
import { useFeedViewStore } from '@/stores/feed-view-store'
import type { Entry, Feed, Folder, ContentType } from '@/types/api'

interface EntryListProps {
  selection: SelectionType
  selectedEntryId: string | null
  onSelectEntry: (entryId: string) => void
  onMarkAllRead: () => void
  onMarkAllReadAndGoNextFeed?: () => void
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  contentType: ContentType
  isMobile?: boolean
  onMenuClick?: () => void
  isTablet?: boolean
  onToggleSidebar?: () => void
  sidebarVisible?: boolean
}

const ESTIMATED_ITEM_HEIGHT = 100
const TOP_BAR_HEIGHT = 56
const MARK_READ_BUTTON_STORAGE_KEY = 'gist.markAllReadButtonPos'

type StoredButtonPosition = { xRatio: number; yRatio: number }

function loadStoredButtonPosition(): StoredButtonPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MARK_READ_BUTTON_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as StoredButtonPosition
    if (typeof value.xRatio !== 'number' || typeof value.yRatio !== 'number') return null
    if (!Number.isFinite(value.xRatio) || !Number.isFinite(value.yRatio)) return null
    return {
      xRatio: Math.min(Math.max(value.xRatio, 0), 1),
      yRatio: Math.min(Math.max(value.yRatio, 0), 1),
    }
  } catch {
    return null
  }
}

function storeButtonPosition(position: StoredButtonPosition) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MARK_READ_BUTTON_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // ignore storage errors
  }
}

export function EntryList({
  selection,
  selectedEntryId,
  onSelectEntry,
  onMarkAllRead,
  onMarkAllReadAndGoNextFeed,
  unreadOnly,
  onToggleUnreadOnly,
  contentType,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
}: EntryListProps) {
  'use no memo'

  const { t } = useTranslation()
  const params = selectionToParams(selection, contentType)
  const containerRef = useRef<HTMLDivElement>(null)
  const listWrapperRef = useRef<HTMLDivElement>(null)
  const markReadButtonRef = useRef<HTMLButtonElement>(null)
  const markReadPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    startX: number
    startY: number
  } | null>(null)
  const dragMovedRef = useRef(false)
  const [markReadPosition, setMarkReadPosition] = useState<{ x: number; y: number } | null>(null)

  const getFeedExplicitViewMode = useFeedViewStore((s) => s.getExplicitMode)

  useScrollToTop(containerRef, 'entrylist')

  const { data: feeds = [] } = useFeeds()
  const { data: folders = [] } = useFolders()
  const { data: aiSettings } = useAISettings()
  const { data: generalSettings } = useGeneralSettings()
  const { data: unreadCounts } = useUnreadCounts()
  const { mutate: markAsRead } = useMarkAsRead()
  const removeFromUnreadList = useRemoveFromUnreadList()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite({ ...params, unreadOnly })

  // Swipe gesture: Right swipe opens sidebar (only on mobile)
  useSwipeGesture(listWrapperRef, {
    onSwipeRight: () => onMenuClick?.(),
    enabledDirections: ['right'],
    threshold: 100,
    preventScroll: true,
    enabled: Boolean(isMobile && onMenuClick),
  })

  // Track translated entries to avoid re-translating
  const translatedEntries = useRef(new Set<string>())
  const pendingTranslation = useRef(new Map<string, Entry>())
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoTranslate = aiSettings?.autoTranslate ?? false
  const targetLanguage = aiSettings?.summaryLanguage ?? 'zh-CN'

  // Save/restore scroll position per selection+contentType
  const scrollKey = selectionScrollKey(selection, contentType)

  // Restore scroll position on same-mount key change (e.g., article -> notification).
  // On remount (e.g., returning from picture mode), the virtualizer's own
  // _willUpdate handles restoration via initialOffset.
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return

    const saved = entryListScrollPositions.get(scrollKey)
    node.scrollTop = saved ?? 0
  }, [scrollKey])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const handleScroll = () => {
      entryListScrollPositions.set(scrollKey, node.scrollTop)
    }

    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      node.removeEventListener('scroll', handleScroll)
    }
  }, [scrollKey])

  // Cancel pending translations and reset state when list changes
  useEffect(() => {
    // Cancel any in-flight batch translations
    cancelAllBatchTranslations()
    // Clear translation tracking for new list
    translatedEntries.current.clear()
    pendingTranslation.current.clear()
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [selection, contentType])

  const feedsMap = useMemo(() => {
    const map = new Map<string, Feed>()
    for (const feed of feeds) {
      map.set(feed.id, feed)
    }
    return map
  }, [feeds])

  const foldersMap = useMemo(() => {
    const map = new Map<string, Folder>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.entries) ?? [],
    [data]
  )

  const unreadCleanupKey = useMemo(() => {
    switch (selection.type) {
      case 'feed':
        return `feed:${selection.feedId}:${contentType}:${unreadOnly ? '1' : '0'}`
      case 'folder':
        return `folder:${selection.folderId}:${contentType}:${unreadOnly ? '1' : '0'}`
      case 'starred':
        return `starred:${contentType}:${unreadOnly ? '1' : '0'}`
      case 'all':
      default:
        return `all:${contentType}:${unreadOnly ? '1' : '0'}`
    }
  }, [selection, contentType, unreadOnly])

  const lastUnreadCleanupKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!unreadOnly) return
    if (isLoading) return
    if (lastUnreadCleanupKeyRef.current === unreadCleanupKey) return

    const idsToRemove = new Set<string>()
    for (const entry of entries) {
      if (entry.read) {
        idsToRemove.add(entry.id)
      }
    }

    if (idsToRemove.size > 0) {
      removeFromUnreadList(idsToRemove)
    }

    lastUnreadCleanupKeyRef.current = unreadCleanupKey
  }, [entries, unreadOnly, isLoading, unreadCleanupKey, removeFromUnreadList])

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    // Restore offset and measurements on remount (only used on first mount)
    initialOffset: entryListScrollPositions.get(scrollKey),
    initialMeasurementsCache: entryListMeasurementsCache.get(scrollKey),
    onChange: (instance) => {
      if (!instance.isScrolling) {
        entryListMeasurementsCache.set(scrollKey, instance.measurementsCache)
      }
    },
  })

  const virtualItems = virtualizer.getVirtualItems()

  const handleMarkReadOnScroll = useCallback((entryId: string) => {
    markAsRead({ id: entryId, read: true, skipInvalidate: true })
  }, [markAsRead])

  const handleEntryClick = useCallback((entry: Entry) => {
    const viewMode = getFeedExplicitViewMode(entry.feedId)
    if (viewMode === 'browser' && entry.url) {
      window.open(entry.url, '_blank', 'noopener,noreferrer')
      return
    }
    onSelectEntry(entry.id)
  }, [getFeedExplicitViewMode, onSelectEntry])

  useEffect(() => {
    const lastItem = virtualItems.at(-1)
    if (!lastItem) return

    if (lastItem.index >= entries.length - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [virtualItems, entries.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Function to trigger batch translation for pending entries
  const triggerBatchTranslation = useCallback(() => {
    if (pendingTranslation.current.size === 0) return

    const articlesToTranslate = Array.from(pendingTranslation.current.values())
      .filter((entry) => !translatedEntries.current.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        title: entry.title || '',
        summary: entry.content ? stripHtml(entry.content).slice(0, 200) : null,
      }))

    // Mark as translated to prevent re-translating
    for (const article of articlesToTranslate) {
      translatedEntries.current.add(article.id)
    }

    pendingTranslation.current.clear()

    if (articlesToTranslate.length > 0) {
      translateArticlesBatch(articlesToTranslate, targetLanguage).finally(() => {
        // Remove entries that didn't actually get translated (cancelled, partial failure, etc.)
        for (const article of articlesToTranslate) {
          const cached = translationActions.get(article.id, targetLanguage)
          if (!cached?.title && !cached?.summary) {
            translatedEntries.current.delete(article.id)
          }
        }
      })
    }
  }, [targetLanguage])

  // Schedule entry for translation when visible
  const scheduleTranslation = useCallback(
    (entry: Entry) => {
      if (!autoTranslate) return
      if (translatedEntries.current.has(entry.id)) {
        // Verify against store: if marked but no actual translation, allow retry
        const cached = translationActions.get(entry.id, targetLanguage)
        if (cached?.title || cached?.summary) return
        translatedEntries.current.delete(entry.id)
      }
      // Skip if user manually disabled translation for this article
      if (translationActions.isDisabled(entry.id)) return

      // Check if needs translation
      const summary = entry.content ? stripHtml(entry.content).slice(0, 200) : null
      if (!needsTranslation(entry.title || '', summary, targetLanguage)) {
        translatedEntries.current.add(entry.id)
        return
      }

      // Add to pending
      pendingTranslation.current.set(entry.id, entry)

      // Debounce batch translation
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
      debounceTimer.current = setTimeout(triggerBatchTranslation, 500)
    },
    [autoTranslate, targetLanguage, triggerBatchTranslation]
  )

  // Trigger translation for visible items and selected entry
  useEffect(() => {
    if (!autoTranslate) return

    const visibleEntryIds = new Set<string>()
    for (const virtualRow of virtualItems) {
      const entry = entries[virtualRow.index]
      if (entry) {
        visibleEntryIds.add(entry.id)
        scheduleTranslation(entry)
      }
    }

    // Selected entry may be outside the visible range, still needs translation
    if (selectedEntryId && !visibleEntryIds.has(selectedEntryId)) {
      const selectedEntry = entries.find((e) => e.id === selectedEntryId)
      if (selectedEntry) {
        scheduleTranslation(selectedEntry)
      }
    }
  }, [virtualItems, entries, autoTranslate, scheduleTranslation, selectedEntryId])

  const title = useMemo(() => {
    switch (selection.type) {
      case 'all':
        switch (contentType) {
          case 'picture':
            return t('entry_list.all_pictures')
          case 'notification':
            return t('entry_list.all_notifications')
          default:
            return t('entry_list.all_articles')
        }
      case 'feed':
        return feedsMap.get(selection.feedId)?.title || t('entry_list.feed')
      case 'folder':
        return foldersMap.get(selection.folderId)?.name || t('entry_list.folder')
      case 'starred':
        return t('entry_list.starred')
    }
  }, [selection, contentType, feedsMap, foldersMap, t])

  // Calculate unread count from API data (not from loaded entries)
  const unreadCount = useMemo(() => {
    if (!unreadCounts) return 0
    const counts = unreadCounts.counts
    switch (selection.type) {
      case 'all':
        // Sum all feeds' unread counts, filtered by contentType
        return feeds
          .filter((f) => f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0)
      case 'feed':
        return counts[selection.feedId] ?? 0
      case 'folder':
        // Sum unread counts for feeds in this folder with matching contentType
        return feeds
          .filter((f) => f.folderId === selection.folderId && f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0)
      case 'starred':
        return 0 // Starred view doesn't show unread count
    }
  }, [unreadCounts, selection, feeds, contentType])

  const showMarkAllReadFooter = Boolean(
    onMarkAllReadAndGoNextFeed && (selection.type === 'feed' || selection.type === 'folder')
  )

  useLayoutEffect(() => {
    if (!showMarkAllReadFooter) return
    if (markReadPosition) return

    const wrapper = listWrapperRef.current
    const button = markReadButtonRef.current
    if (!wrapper || !button) return

    const wrapperRect = wrapper.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const padding = 16

    const stored = loadStoredButtonPosition()
    const maxX = Math.max(padding, wrapperRect.width - buttonRect.width - padding)
    const maxY = Math.max(padding, wrapperRect.height - buttonRect.height - padding)

    if (stored) {
      setMarkReadPosition({
        x: padding + stored.xRatio * Math.max(0, maxX - padding),
        y: padding + stored.yRatio * Math.max(0, maxY - padding),
      })
      return
    }

    setMarkReadPosition({
      x: maxX,
      y: maxY,
    })
  }, [showMarkAllReadFooter, markReadPosition])

  useEffect(() => {
    markReadPositionRef.current = markReadPosition
  }, [markReadPosition])

  const handleMarkReadPointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current
    const wrapper = listWrapperRef.current
    const button = markReadButtonRef.current
    if (!state || !wrapper || !button) return

    const wrapperRect = wrapper.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const padding = 8

    const nextX = state.originX + (event.clientX - state.startX)
    const nextY = state.originY + (event.clientY - state.startY)

    if (!dragMovedRef.current) {
      const deltaX = Math.abs(event.clientX - state.startX)
      const deltaY = Math.abs(event.clientY - state.startY)
      if (deltaX > 3 || deltaY > 3) {
        dragMovedRef.current = true
      }
    }

    const maxX = wrapperRect.width - buttonRect.width - padding
    const maxY = wrapperRect.height - buttonRect.height - padding

    setMarkReadPosition({
      x: Math.min(Math.max(padding, nextX), Math.max(padding, maxX)),
      y: Math.min(Math.max(padding, nextY), Math.max(padding, maxY)),
    })
  }, [])

  const handleMarkReadPointerUp = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current
    if (!state || event.pointerId !== state.pointerId) return

    dragStateRef.current = null
    const wrapper = listWrapperRef.current
    const button = markReadButtonRef.current
    const position = markReadPositionRef.current
    if (wrapper && button && position) {
      const wrapperRect = wrapper.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      const padding = 8
      const maxX = Math.max(0, wrapperRect.width - buttonRect.width - padding * 2)
      const maxY = Math.max(0, wrapperRect.height - buttonRect.height - padding * 2)
      storeButtonPosition({
        xRatio: maxX === 0 ? 0 : (position.x - padding) / maxX,
        yRatio: maxY === 0 ? 0 : (position.y - padding) / maxY,
      })
    }
    document.removeEventListener('pointermove', handleMarkReadPointerMove)
    document.removeEventListener('pointerup', handleMarkReadPointerUp)
  }, [handleMarkReadPointerMove])

  const handleMarkReadPointerDown = useCallback((event: ReactPointerEvent) => {
    const wrapper = listWrapperRef.current
    if (!wrapper || !markReadPosition) return

    dragMovedRef.current = false
    dragStateRef.current = {
      pointerId: event.pointerId,
      originX: markReadPosition.x,
      originY: markReadPosition.y,
      startX: event.clientX,
      startY: event.clientY,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    document.addEventListener('pointermove', handleMarkReadPointerMove)
    document.addEventListener('pointerup', handleMarkReadPointerUp)
  }, [handleMarkReadPointerMove, handleMarkReadPointerUp, markReadPosition])

  const handleMarkReadClick = useCallback((event: ReactMouseEvent) => {
    if (dragMovedRef.current) {
      event.preventDefault()
      event.stopPropagation()
      dragMovedRef.current = false
      return
    }
    onMarkAllReadAndGoNextFeed?.()
  }, [onMarkAllReadAndGoNextFeed])

  return (
    <div ref={listWrapperRef} className="relative flex h-full flex-col">
      <EntryListHeader
        title={title}
        unreadCount={unreadCount}
        unreadOnly={unreadOnly}
        onToggleUnreadOnly={onToggleUnreadOnly}
        onMarkAllRead={onMarkAllRead}
        viewMenuFeedId={selection.type === 'feed' ? selection.feedId : undefined}
        viewMenuDefaultMode={(generalSettings?.autoReadability ?? false) ? 'readability' : 'normal'}
        scrollToTopScope="entrylist"
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        isTablet={isTablet}
        onToggleSidebar={onToggleSidebar}
        sidebarVisible={sidebarVisible}
      />

      <ScrollAreaPrimitive.Root className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full overflow-y-auto">
          {isLoading ? (
            <EntryListSkeleton />
          ) : entries.length === 0 ? (
            <EntryListEmpty />
          ) : (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              <div
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const entry = entries[virtualRow.index]
                  return (
                    <EntryListItem
                      key={entry.id}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      entry={entry}
                      feed={feedsMap.get(entry.feedId)}
                      isSelected={entry.id === selectedEntryId}
                      onClick={() => handleEntryClick(entry)}
                      autoTranslate={autoTranslate}
                      targetLanguage={targetLanguage}
                      markReadOnScroll={generalSettings?.markReadOnScroll ?? false}
                      scrollRootRef={containerRef}
                      topOffset={TOP_BAR_HEIGHT}
                      onMarkRead={handleMarkReadOnScroll}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {isFetchingNextPage && <LoadingMore />}

        </div>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>

      {showMarkAllReadFooter && (
        <button
          ref={markReadButtonRef}
          type="button"
          onClick={handleMarkReadClick}
          onPointerDown={handleMarkReadPointerDown}
          title={t('entry.mark_all_read')}
          aria-label={t('entry.mark_all_read')}
          className={cn(
            'absolute z-30 flex size-12 items-center justify-center rounded-full',
            'bg-muted text-foreground shadow-lg',
            'transition-colors hover:bg-item-hover active:scale-95',
            'touch-none'
          )}
          style={{
            left: markReadPosition?.x ?? 16,
            top: markReadPosition?.y ?? 16,
            opacity: markReadPosition ? 1 : 0,
            pointerEvents: markReadPosition ? 'auto' : 'none',
          }}
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </svg>
        </button>
      )}
    </div>
  )
}

function EntryListSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="px-4 py-3 animate-pulse">
          {/* Line 1: icon + feed name + time */}
          <div className="flex items-center gap-1.5">
            <div className="size-4 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
          {/* Line 2: title */}
          <div className="mt-1 h-4 w-3/4 rounded bg-muted" />
          {/* Line 3: summary */}
          <div className="mt-1 h-3 w-full rounded bg-muted" />
          <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function EntryListEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
      {t('entry_list.no_articles')}
    </div>
  )
}

function LoadingMore() {
  return (
    <div className="flex items-center justify-center py-4">
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
