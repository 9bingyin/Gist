import { useEffect, useState, useCallback } from 'react'
import { useEntry, useMarkAsRead } from '@/hooks/useEntries'
import { useEntryContentScroll } from '@/hooks/useEntryContentScroll'
import { fetchReadableContent } from '@/api'
import { EntryContentHeader } from './EntryContentHeader'
import { EntryContentBody } from './EntryContentBody'

interface EntryContentProps {
  entryId: number | null
}

export function EntryContent({ entryId }: EntryContentProps) {
  const { data: entry, isLoading } = useEntry(entryId)
  const { mutate: markAsRead } = useMarkAsRead()
  const { scrollRef, isAtTop } = useEntryContentScroll(entryId)

  const [isReadableLoading, setIsReadableLoading] = useState(false)
  const [localReadableContent, setLocalReadableContent] = useState<string | null>(null)
  const [showReadable, setShowReadable] = useState(false)
  const [readableError, setReadableError] = useState<string | null>(null)

  useEffect(() => {
    if (entry && !entry.read) {
      markAsRead({ id: entry.id, read: true })
    }
  }, [entry, markAsRead])

  const readableContent = localReadableContent || entry?.readableContent
  const hasReadableContent = !!readableContent

  const handleToggleReadable = useCallback(async () => {
    if (!entry) return

    if (hasReadableContent) {
      setShowReadable((prev) => !prev)
      return
    }

    if (!entry.url || isReadableLoading) return
    setIsReadableLoading(true)
    setReadableError(null)
    try {
      const content = await fetchReadableContent(entry.id)
      setLocalReadableContent(content)
      setShowReadable(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch readable content'
      setReadableError(message)
    } finally {
      setIsReadableLoading(false)
    }
  }, [entry, hasReadableContent, isReadableLoading])

  const displayContent = hasReadableContent && showReadable ? readableContent : entry?.content
  const isReadableActive = hasReadableContent && showReadable

  if (entryId === null) {
    return <EntryContentEmpty />
  }

  if (isLoading) {
    return <EntryContentSkeleton />
  }

  if (!entry) {
    return <EntryContentEmpty />
  }

  return (
    <div className="relative flex h-full flex-col">
      <EntryContentHeader
        entry={entry}
        isAtTop={isAtTop}
        isReadableActive={isReadableActive}
        isLoading={isReadableLoading}
        error={readableError}
        onToggleReadable={handleToggleReadable}
      />
      <EntryContentBody entry={entry} scrollRef={scrollRef} displayContent={displayContent} />
    </div>
  )
}

function EntryContentEmpty() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-6" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <svg
            className="mx-auto size-12 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm">Select an article to read</p>
        </div>
      </div>
    </div>
  )
}

function EntryContentSkeleton() {
  return (
    <div className="relative flex h-full flex-col animate-pulse">
      {/* Empty header placeholder - matches EntryContentHeader height when isAtTop=true */}
      <div className="absolute inset-x-0 top-0 z-20">
        <div className="h-12" />
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pb-20 pt-16">
          <div className="mb-10 space-y-5">
            <div className="h-10 w-3/4 rounded bg-muted" />
            <div className="flex gap-6">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
            <hr className="border-border/60" />
          </div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}
