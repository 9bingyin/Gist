import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEntriesInfinite } from '@/hooks/useEntries'
import { selectionToParams, type SelectionType } from '@/hooks/useSelection'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EntryListItem } from './EntryListItem'
import { EntryListHeader } from './EntryListHeader'

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
  const params = selectionToParams(selection)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite(params)

  const entries = data?.pages.flatMap((page) => page.entries) ?? []

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    measureElement: (element) => element.getBoundingClientRect().height,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems.at(-1)
    if (!lastItem) return

    if (lastItem.index >= entries.length - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [virtualItems, entries.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const title = getListTitle(selection)
  const unreadCount = entries.filter((e) => !e.read).length

  return (
    <div className="flex h-full flex-col">
      <EntryListHeader
        title={title}
        unreadCount={unreadCount}
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
                  data-index={virtualRow.index}
                  entry={entry}
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

function getListTitle(selection: SelectionType): string {
  switch (selection.type) {
    case 'all':
      return 'All Articles'
    case 'feed':
      return 'Feed Articles'
    case 'folder':
      return 'Folder Articles'
  }
}

function EntryListSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="px-4 py-3 animate-pulse bg-muted/5">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-3 w-full rounded bg-muted" />
          <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
          <div className="mt-2 h-3 w-1/4 rounded bg-muted" />
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
