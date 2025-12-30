import { useEffect, useRef, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntriesInfinite } from '@/hooks/useEntries'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EntryListItem } from './EntryListItem'
import { EntryListHeader } from './EntryListHeader'
import type { Feed, Folder } from '@/types/api'

interface EntryListProps {
  selection: SelectionType
  selectedEntryId: number | null
  onSelectEntry: (entryId: number) => void
  onMarkAllRead: () => void
}

const ESTIMATED_ITEM_HEIGHT = 100

export function EntryList({
  selection,
  selectedEntryId,
  onSelectEntry,
  onMarkAllRead,
}: EntryListProps) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const params = selectionToParams(selection)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: feeds = [] } = useFeeds()
  const { data: folders = [] } = useFolders()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite({ ...params, unreadOnly })

  const feedsMap = useMemo(() => {
    const map = new Map<number, Feed>()
    for (const feed of feeds) {
      map.set(feed.id, feed)
    }
    return map
  }, [feeds])

  const foldersMap = useMemo(() => {
    const map = new Map<number, Folder>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  const entries = data?.pages.flatMap((page) => page.entries) ?? []

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems.at(-1)
    if (!lastItem) return

    if (lastItem.index >= entries.length - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [virtualItems, entries.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const title = getListTitle(selection, feedsMap, foldersMap)
  const unreadCount = entries.filter((e) => !e.read).length

  return (
    <div className="flex h-full flex-col">
      <EntryListHeader
        title={title}
        unreadCount={unreadCount}
        unreadOnly={unreadOnly}
        onToggleUnreadOnly={() => setUnreadOnly((prev) => !prev)}
        onMarkAllRead={onMarkAllRead}
      />

      <ScrollArea ref={containerRef} className="min-h-0 flex-1">
        {isLoading ? (
          <EntryListSkeleton />
        ) : entries.length === 0 ? (
          <EntryListEmpty />
        ) : (
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
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
                  onClick={() => onSelectEntry(entry.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                />
              )
            })}
          </div>
        )}

        {isFetchingNextPage && <LoadingMore />}
      </ScrollArea>
    </div>
  )
}

function getListTitle(
  selection: SelectionType,
  feedsMap: Map<number, Feed>,
  foldersMap: Map<number, Folder>
): string {
  switch (selection.type) {
    case 'all':
      return 'All Articles'
    case 'feed':
      return feedsMap.get(selection.feedId)?.title || 'Feed'
    case 'folder':
      return foldersMap.get(selection.folderId)?.name || 'Folder'
  }
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
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No articles
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
