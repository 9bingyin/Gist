import { forwardRef, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'
import { stripHtml } from '@/lib/html-utils'
import { useTranslationStore } from '@/stores/translation-store'
import { FeedIcon } from '@/components/ui/feed-icon'
import type { Entry, Feed } from '@/types/api'

const URL_PATTERN = /\bhttps?:\/\/\S+/i

interface EntryListItemProps {
  entry: Entry
  feed?: Feed
  isSelected: boolean
  onClick: () => void
  autoTranslate?: boolean
  targetLanguage?: string
  style?: React.CSSProperties
  'data-index'?: number
  markReadOnScroll?: boolean
  scrollRootRef?: React.RefObject<HTMLElement | null> | null
  topOffset?: number
  onMarkRead?: (entryId: string) => void
  'data-entry-id'?: string
}

export const EntryListItem = forwardRef<HTMLDivElement, EntryListItemProps>(
  function EntryListItem(
    {
      entry,
      feed,
      isSelected,
      onClick,
      autoTranslate,
      targetLanguage,
      style,
      'data-index': dataIndex,
      markReadOnScroll,
      scrollRootRef,
      topOffset = 0,
      onMarkRead,
      'data-entry-id': dataEntryId,
    },
    ref
  ) {
    const { t } = useTranslation()
    const publishedAt = entry.publishedAt ? formatRelativeTime(entry.publishedAt, t) : null
    const [iconError, setIconError] = useState(false)
    const showIcon = feed?.iconPath && !iconError
    const fallbackTitle = t('entry.untitled')
    const fallbackFeedName = t('entry.unknown_feed')
  const itemRef = useRef<HTMLDivElement | null>(null)
  const hasBeenVisibleRef = useRef(false)

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    itemRef.current = node
    if (!ref) return
    if (typeof ref === 'function') {
      ref(node)
    } else {
      ref.current = node
    }
  }, [ref])

    const translation = useTranslationStore((state) =>
      autoTranslate && targetLanguage
        ? state.getTranslation(entry.id, targetLanguage)
        : undefined
    )

    const strippedContent = useMemo(
      () => (entry.content ? stripHtml(entry.content).slice(0, 150) : null),
      [entry.content]
    )

    const displayTitle = translation?.title ?? entry.title
    const displaySummary = translation?.summary ?? strippedContent

  useEffect(() => {
    if (!markReadOnScroll || entry.read || !onMarkRead) return
    if (!itemRef.current) return
    // scrollRootRef === null  → viewport mode (mobile window scroll)
    // scrollRootRef === undefined or ref.current is null → not ready yet
    const useViewport = scrollRootRef === null
    const root = useViewport ? null : scrollRootRef?.current
    if (!useViewport && !root) return

    hasBeenVisibleRef.current = false

    const observer = new IntersectionObserver(
      (observerEntries) => {
        observerEntries.forEach((observerEntry) => {
          // rootBounds may be null when root is the viewport (implicit root)
          const rootTop = observerEntry.rootBounds?.top ?? 0

          if (observerEntry.isIntersecting) {
            hasBeenVisibleRef.current = true
            return
          }

          const cardRect = observerEntry.boundingClientRect
          if (hasBeenVisibleRef.current && cardRect.top < rootTop) {
            onMarkRead(entry.id)
            observer.unobserve(observerEntry.target)
          }
        })
      },
      {
        root,
        threshold: 0.2,
        rootMargin: `-${topOffset}px 0px 0px 0px`,
      }
    )

    observer.observe(itemRef.current)

    return () => {
      if (itemRef.current) {
        observer.unobserve(itemRef.current)
      }
      observer.disconnect()
    }
  }, [entry.id, entry.read, markReadOnScroll, onMarkRead, scrollRootRef, topOffset])
    const displayFeedName = feed?.title || fallbackFeedName
    const titleContainsUrl = URL_PATTERN.test(displayTitle ?? '')
    const summaryContainsUrl = URL_PATTERN.test(displaySummary ?? '')

    return (
      <div
        ref={setRefs}
        className={cn(
          'w-full min-w-0 overflow-hidden px-4 py-3 cursor-pointer transition-colors',
          'hover:bg-item-hover',
          isSelected && 'bg-item-active',
          !entry.read && !isSelected && 'bg-accent/5'
        )}
        style={style}
        data-index={dataIndex}
        data-entry-id={dataEntryId}
        onClick={onClick}
      >
        {/* Line 1: icon + feed name + time */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
          {showIcon ? (
            <img
              src={`/icons/${feed.iconPath}`}
              alt=""
              className="size-4 shrink-0 rounded object-contain"
              onError={() => setIconError(true)}
            />
          ) : (
            <FeedIcon className="size-4 shrink-0 text-muted-foreground/50" />
          )}
          <span className="block min-w-0 truncate">{displayFeedName}</span>
          {publishedAt && (
            <span className="shrink-0 ml-auto shrink-0 whitespace-nowrap">{publishedAt}</span>
          )}
        </div>

        {/* Line 2: title */}
        <div
          className={cn(
            'mt-1 text-sm wrap-anywhere',
            titleContainsUrl ? 'line-clamp-3' : 'line-clamp-2 text-left',
            !entry.read ? 'font-semibold' : 'font-medium text-muted-foreground'
          )}
        >
          {displayTitle || fallbackTitle}
        </div>

        {/* Line 3: summary */}
        {displaySummary && (
          <div
            className={cn(
              'mt-1 text-xs text-muted-foreground wrap-anywhere',
              summaryContainsUrl ? 'line-clamp-3' : 'line-clamp-2'
            )}
          >
            {displaySummary}
          </div>
        )}
      </div>
    )
  }
)
