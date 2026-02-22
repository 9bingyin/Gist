import { useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntry, useMarkAsRead, useMarkAsStarred, useRemoveFromUnreadList } from '@/hooks/useEntries'
import { useAISettings } from '@/hooks/useAISettings'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'
import { useEntryContentScroll } from '@/hooks/useEntryContentScroll'
import { useScrollToTop } from '@/hooks/useScrollToTop'
import { useReadability } from '@/hooks/useReadability'
import { useAISummary } from '@/hooks/useAISummary'
import { useAITranslation } from '@/hooks/useAITranslation'
import { useFeedViewStore } from '@/stores/feed-view-store'
import { EntryContentHeader } from './EntryContentHeader'
import { EntryContentBody } from './EntryContentBody'

interface EntryContentProps {
  entryId: string | null
  isMobile?: boolean
  onBack?: () => void
}

export function EntryContent({ entryId, isMobile, onBack }: EntryContentProps) {
  const { t } = useTranslation()
  const { data: entry, isLoading } = useEntry(entryId)
  const { data: aiSettings } = useAISettings()
  const { data: generalSettings } = useGeneralSettings()
  const { mutate: markAsRead } = useMarkAsRead()
  const { mutate: markAsStarred } = useMarkAsStarred()
  const removeFromUnreadList = useRemoveFromUnreadList()
  const { scrollRef, isAtTop, scrollNode } = useEntryContentScroll(entryId)

  useScrollToTop(scrollNode, 'entrycontent')

  // Track entries marked as read to trigger list removal on switch
  const markedAsReadRef = useRef<Set<string>>(new Set())

  const autoTranslate = aiSettings?.autoTranslate ?? false
  const targetLanguage = aiSettings?.summaryLanguage ?? 'zh-CN'
  const feedViewModeExplicit = useFeedViewStore((s) =>
    entry ? s.getExplicitMode(entry.feedId) : undefined
  )
  const autoReadabilityFromSettings = generalSettings?.autoReadability ?? false
  const autoReadability =
    feedViewModeExplicit === 'readability'
      ? true
      : feedViewModeExplicit
        ? false
        : autoReadabilityFromSettings
  const autoSummary = aiSettings?.autoSummary ?? false

  // Readability hook
  const {
    isReadableLoading,
    readableContent,
    readableError,
    isReadableActive,
    baseContent,
    handleToggleReadable,
  } = useReadability({ entry, autoReadability })

  // AI Summary hook
  const {
    aiSummary,
    isLoadingSummary,
    summaryError,
    handleToggleSummary,
  } = useAISummary({
    entry,
    isReadableActive,
    readableContent,
    autoSummary,
  })

  // AI Translation hook
  const {
    isTranslating,
    hasTranslation,
    translationDisabled,
    displayTitle,
    translatedContentBlocks,
    combinedTranslatedContent,
    handleToggleTranslation,
  } = useAITranslation({
    entry,
    isReadableActive,
    readableContent,
    autoTranslate,
    targetLanguage,
  })

  // Mark as read when entry is loaded
  // Use skipInvalidate to prevent list item from disappearing immediately
  useEffect(() => {
    if (entry && !entry.read) {
      markedAsReadRef.current.add(entry.id)
      markAsRead({ id: entry.id, read: true, skipInvalidate: true })
    }
  }, [entry, markAsRead])

  // Remove read entries from unreadOnly list when component unmounts (switching articles)
  // Note: EntryContent uses key={entryId} in App.tsx, so it unmounts/remounts on switch
  useEffect(() => {
    const markedAsReadSet = markedAsReadRef.current
    return () => {
      if (markedAsReadSet.size > 0) {
        removeFromUnreadList(markedAsReadSet)
        markedAsReadSet.clear()
      }
    }
  }, [removeFromUnreadList])

  const handleToggleStarred = useCallback(() => {
    if (entry) {
      markAsStarred({ id: entry.id, starred: !entry.starred })
    }
  }, [entry, markAsStarred])

  // Determine display content
  const displayContent = combinedTranslatedContent ?? baseContent
  const highlightContent = combinedTranslatedContent ?? baseContent ?? ''

  if (entryId === null) {
    return <EntryContentEmpty message={t('entry.select_article')} />
  }

  if (isLoading) {
    return <EntryContentSkeleton />
  }

  if (!entry) {
    return <EntryContentEmpty message={t('entry.select_article')} />
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <EntryContentHeader
        entry={entry}
        displayTitle={displayTitle}
        isAtTop={isAtTop}
        isReadableActive={isReadableActive}
        isLoading={isReadableLoading}
        error={readableError}
        onToggleReadable={handleToggleReadable}
        onToggleStarred={handleToggleStarred}
        isLoadingSummary={isLoadingSummary}
        hasSummary={!!aiSummary}
        onToggleSummary={handleToggleSummary}
        isTranslating={isTranslating}
        hasTranslation={hasTranslation}
        translationDisabled={translationDisabled}
        onToggleTranslation={handleToggleTranslation}
        isMobile={isMobile}
        onBack={onBack}
      />
      <EntryContentBody
        entry={entry}
        displayTitle={displayTitle}
        scrollRef={scrollRef}
        scrollNode={scrollNode}
        displayContent={displayContent}
        displayBlocks={translatedContentBlocks}
        highlightContent={highlightContent}
        aiSummary={aiSummary}
        isLoadingSummary={isLoadingSummary}
        summaryError={summaryError}
      />
    </div>
  )
}

function EntryContentEmpty({ message }: { message: string }) {
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
          <p className="mt-2 text-sm">{message}</p>
        </div>
      </div>
    </div>
  )
}

function EntryContentSkeleton() {
  return (
    <div className="relative flex h-full flex-col animate-pulse">
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
