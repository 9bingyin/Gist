import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual'
import { useEntriesInfinite, useMarkAsRead, useRemoveFromUnreadList, useUnreadCounts } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useAISettings } from '@/hooks/useAISettings'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { flattenUniqueEntries } from '@/lib/entry-pagination'
import { stripHtml } from '@/lib/html-utils'
import { cn } from '@/lib/utils'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { ScrollBar } from '@/components/ui/scroll-area'
import { EntryListItem } from './EntryListItem'
import { EntryListHeader } from './EntryListHeader'
import { needsTranslation as needsTranslationAsync } from '@/lib/language-detect-async'
import { translateArticlesBatch, cancelAllBatchTranslations } from '@/services/translation-service'
import { translationActions } from '@/stores/translation-store'
import { selectionScrollKey, entryListScrollPositions } from './scroll-key'
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
  isActive?: boolean
  onMenuClick?: () => void
  isTablet?: boolean
  onToggleSidebar?: () => void
  sidebarVisible?: boolean
}

const ESTIMATED_ITEM_HEIGHT = 100
const TOP_BAR_HEIGHT = 56
const SCROLL_PADDING_COUNT = 5
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
  isActive = true,
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
  const listContentRef = useRef<HTMLDivElement>(null)
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

  // Mobile: scroll the window; Desktop: scroll the container div
  useScrollToTop(isMobile ? 'window' : containerRef, 'entrylist')

  const { data: feeds = [] } = useFeeds()
  const { data: folders = [] } = useFolders()
  const { data: aiSettings } = useAISettings()
  const { data: generalSettings } = useGeneralSettings()
  const { data: unreadCounts } = useUnreadCounts()
  const { mutate: markAsRead } = useMarkAsRead()
  const removeFromUnreadList = useRemoveFromUnreadList()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite({ ...params, unreadOnly })

  const keepReadUntilExit = generalSettings?.keepReadUntilExit ?? false

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
  const pendingDetection = useRef(new Set<string>())
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const translationSession = useRef(0)

  const autoTranslate = aiSettings?.autoTranslate ?? false
  const targetLanguage = aiSettings?.summaryLanguage ?? 'zh-CN'

  // Save/restore scroll position per selection+contentType
  const scrollKey = selectionScrollKey(selection, contentType)

  // Track previous isActive value to detect detail→list transition on mobile
  const prevIsActiveRef = useRef(isActive)

  // Restore scroll position on same-mount key change (e.g., article -> notification).
  // Mobile: uses window scroll; Desktop: uses container div scrollTop.
  useLayoutEffect(() => {
    if (isMobile) {
      if (!isActive) {
        // Entering detail view — record so we know to use rAF on return
        prevIsActiveRef.current = false
        return
      }
      const wasInactive = !prevIsActiveRef.current
      prevIsActiveRef.current = true
      const saved = entryListScrollPositions.get(scrollKey)
      if (saved == null || saved === 0) return
      if (wasInactive) {
        // Returning from detail view: defer so virtualizer re-enables and DOM paints
        requestAnimationFrame(() => {
          window.scrollTo(0, saved)
        })
      } else {
        // scrollKey changed while list was active (e.g., feed switch) — restore immediately
        window.scrollTo(0, saved)
      }
      return
    }
    prevIsActiveRef.current = isActive
    const node = containerRef.current
    if (!node) return
    const saved = entryListScrollPositions.get(scrollKey)
    node.scrollTop = saved ?? 0
  }, [isMobile, isActive, scrollKey])

  useEffect(() => {
    if (isMobile) {
      // Only track window scroll when this list is the active view
      if (!isActive) return
      const handleScroll = () => {
        entryListScrollPositions.set(scrollKey, window.scrollY)
      }
      window.addEventListener('scroll', handleScroll, { passive: true })
      return () => window.removeEventListener('scroll', handleScroll)
    }
    const node = containerRef.current
    if (!node) return
    const handleScroll = () => {
      entryListScrollPositions.set(scrollKey, node.scrollTop)
    }
    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      node.removeEventListener('scroll', handleScroll)
    }
  }, [isMobile, isActive, scrollKey])

  // Cancel pending translations and reset state when list changes
  useEffect(() => {
    // Cancel any in-flight batch translations
    cancelAllBatchTranslations()
    // Clear translation tracking for new list
    translationSession.current += 1
    translatedEntries.current.clear()
    pendingTranslation.current.clear()
    pendingDetection.current.clear()
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    // Reset scroll-read and auto-jump tracking for new selection
    markedReadByScrollRef.current.clear()
    hasTriggeredAutoJumpRef.current = false
  }, [selection, contentType])

  useEffect(() => {
    const pendingDetectionEntries = pendingDetection.current

    return () => {
      translationSession.current += 1
      pendingDetectionEntries.clear()
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
    }
  }, [])

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

  const entries = useMemo(() => flattenUniqueEntries(data?.pages), [data])

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

  const markReadOnScrollEnabled = generalSettings?.markReadOnScroll ?? false

  // Blank spacer rows added at the end so users can scroll the last real entry
  // out of view, allowing it to be marked as read before auto-jumping.
  const scrollPaddingCount =
    markReadOnScrollEnabled && !hasNextPage && !isFetchingNextPage && entries.length > 0
      ? SCROLL_PADDING_COUNT
      : 0
  const totalVirtualCount = entries.length + scrollPaddingCount

  // Mobile: window virtualizer (enables browser address bar auto-hide)
  // Desktop: div virtualizer (contained three-column layout)
  const windowVirtualizer = useWindowVirtualizer({
    count: isMobile ? totalVirtualCount : 0,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    scrollMargin: listContentRef.current?.offsetTop ?? 0,
    enabled: !!isMobile && isActive,
  })

  const divVirtualizer = useVirtualizer({
    count: isMobile ? 0 : totalVirtualCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    // Restore offset on remount (only used on first mount)
    initialOffset: isMobile ? 0 : (entryListScrollPositions.get(scrollKey) ?? 0),
  })

  const virtualizer = isMobile ? windowVirtualizer : divVirtualizer

  const virtualItems = virtualizer.getVirtualItems()

  // Track entries individually marked as read by scrolling past the top bar.
  // Using a Set (rather than a boolean) lets us require ALL initially-unread
  // entries to have scrolled past before triggering the auto-jump.
  const markedReadByScrollRef = useRef(new Set<string>())
  const hasTriggeredAutoJumpRef = useRef(false)

  // Auto-jump to next feed once every entry that was unread on load has
  // individually scrolled past the top bar.  The spacer rows provide the
  // extra scroll distance needed for the last entry to clear the bar.
  useEffect(() => {
    if (!markReadOnScrollEnabled) return
    if (hasTriggeredAutoJumpRef.current) return
    if (selection.type !== 'feed' && selection.type !== 'folder') return
    if (!onMarkAllReadAndGoNextFeed) return
    if (scrollPaddingCount === 0) return
    if (markedReadByScrollRef.current.size === 0) return
    // Every entry must be either already-read on load OR have been scrolled past
    const allScrolledPast = entries.every(
      (e) => e.read || markedReadByScrollRef.current.has(e.id)
    )
    if (!allScrolledPast) return
    hasTriggeredAutoJumpRef.current = true
    onMarkAllReadAndGoNextFeed()
  }, [virtualItems, entries, scrollPaddingCount, markReadOnScrollEnabled, selection.type, onMarkAllReadAndGoNextFeed])

  const handleMarkReadOnScroll = useCallback((entryId: string) => {
    markedReadByScrollRef.current.add(entryId)
    markAsRead({ id: entryId, read: true, skipInvalidate: true })
  }, [markAsRead])

  // Scroll selected entry into view on desktop when selectedEntryId changes
  useEffect(() => {
    if (isMobile) return
    if (!selectedEntryId) return
    const idx = entries.findIndex((e) => e.id === selectedEntryId)
    if (idx < 0) return
    virtualizer.scrollToIndex(idx, { align: 'auto' })
  }, [isMobile, selectedEntryId, entries, virtualizer])

  const handleEntryClick = useCallback((entry: Entry) => {
    const viewMode = getFeedExplicitViewMode(entry.feedId)
    if (viewMode === 'browser' && entry.url) {
      if (!entry.read) {
        markAsRead({ id: entry.id, read: true, skipInvalidate: keepReadUntilExit })
      }
      window.open(entry.url, '_blank', 'noopener,noreferrer')
      return
    }
    onSelectEntry(entry.id)
  }, [getFeedExplicitViewMode, keepReadUntilExit, markAsRead, onSelectEntry])

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

  const queueEntryForTranslation = useCallback((entry: Entry) => {
    pendingTranslation.current.set(entry.id, entry)

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(triggerBatchTranslation, 500)
  }, [triggerBatchTranslation])

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

      if (pendingTranslation.current.has(entry.id) || pendingDetection.current.has(entry.id)) {
        return
      }

      const summary = entry.content ? stripHtml(entry.content).slice(0, 200) : null
      const session = translationSession.current
      pendingDetection.current.add(entry.id)

      void needsTranslationAsync(entry.title || '', summary, targetLanguage)
        .then((shouldTranslate) => {
          if (translationSession.current !== session) return

          if (!shouldTranslate) {
            translatedEntries.current.add(entry.id)
            return
          }

          queueEntryForTranslation(entry)
        })
        .catch(() => {
          if (translationSession.current !== session) return
          queueEntryForTranslation(entry)
        })
        .finally(() => {
          if (translationSession.current === session) {
            pendingDetection.current.delete(entry.id)
          }
        })
    },
    [autoTranslate, targetLanguage, queueEntryForTranslation]
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

  // ─── Mobile layout ───────────────────────────────────────────────────────
  // The list is rendered in normal document flow so that **window** is the
  // scroll container.  Mobile browsers (Chrome, Safari) only auto-hide the
  // address bar / toolbar when the *window* itself scrolls – not when an
  // inner div with overflow:auto scrolls.
  //
  // useWindowVirtualizer is used instead of useVirtualizer; it listens to
  // window scroll events and positions items relative to a scrollMargin
  // derived from listContentRef.offsetTop (the sticky header height).
  if (isMobile) {
    const scrollMargin = windowVirtualizer.options.scrollMargin
    return (
      <div ref={listWrapperRef}>
        {/* Sticky header inside the document flow.
             safe-area-top pads content below the device status bar (notch). */}
        <div className="sticky top-0 z-10 bg-background safe-area-top">
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
          />
        </div>

        <div ref={listContentRef}>
          {isLoading ? (
            <EntryListSkeleton />
          ) : entries.length === 0 ? (
            <EntryListEmpty />
          ) : (
            <div
              className="relative w-full"
              style={{ height: windowVirtualizer.getTotalSize() }}
            >
              <div
                style={{
                  transform: `translateY(${(virtualItems[0]?.start ?? 0) - scrollMargin}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (virtualRow.index >= entries.length) {
                    return (
                      <div
                        key={`spacer-${virtualRow.index}`}
                        ref={windowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{ height: ESTIMATED_ITEM_HEIGHT }}
                      />
                    )
                  }
                  const entry = entries[virtualRow.index]
                  if (!entry) return null
                  return (
                    <EntryListItem
                      key={entry.id}
                      ref={windowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      entry={entry}
                      feed={feedsMap.get(entry.feedId)}
                      isSelected={entry.id === selectedEntryId}
                      onClick={() => handleEntryClick(entry)}
                      autoTranslate={autoTranslate}
                      targetLanguage={targetLanguage}
                      markReadOnScroll={generalSettings?.markReadOnScroll ?? false}
                      scrollRootRef={null}
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

        {showMarkAllReadFooter && (
          <button
            ref={markReadButtonRef}
            type="button"
            onClick={handleMarkReadClick}
            onPointerDown={handleMarkReadPointerDown}
            title={t('entry.mark_all_read')}
            aria-label={t('entry.mark_all_read')}
            className={cn(
              'fixed z-30 flex size-12 items-center justify-center rounded-full',
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

  // ─── Desktop / tablet layout ──────────────────────────────────────────────
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
        <div
          ref={containerRef}
          className={cn(
            'h-full overflow-y-auto [overflow-anchor:none]',
            // On desktop keep scroll containment; on mobile omit it so Chrome
            // Android can promote this div to "implicit root scroller" and
            // auto-hide the address bar.  Chrome explicitly rejects elements
            // whose overscroll-behavior-y !== auto as root scroller candidates.
            !isMobile && 'overscroll-y-contain',
          )}
        >
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
                  if (virtualRow.index >= entries.length) {
                    return (
                      <div
                        key={`spacer-${virtualRow.index}`}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{ height: ESTIMATED_ITEM_HEIGHT }}
                      />
                    )
                  }
                  const entry = entries[virtualRow.index]
                  if (!entry) return null

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
