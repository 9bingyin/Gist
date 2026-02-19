import { forwardRef, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'
import { stripHtml } from '@/lib/html-utils'
import { useTranslationStore } from '@/stores/translation-store'
import { FeedIcon } from '@/components/ui/feed-icon'
import type { Entry, Feed } from '@/types/api'

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
  scrollRootRef?: React.RefObject<HTMLElement | null>
  topOffset?: number
  onMarkRead?: (entryId: string) => void
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


    // Get translation from store
    const translation = useTranslationStore((state) =>
      autoTranslate && targetLanguage
        ? state.getTranslation(entry.id, targetLanguage)
        : undefined
    )

    // Cache stripped HTML to avoid DOMParser on every render
    const strippedContent = useMemo(
      () => (entry.content ? stripHtml(entry.content).slice(0, 150) : null),
      [entry.content]
    )

    // Use translated content if available
    const displayTitle = translation?.title ?? entry.title
    const displaySummary = translation?.summary ?? strippedContent

  useEffect(() => {
    if (!markReadOnScroll || entry.read || !onMarkRead) return
    const root = scrollRootRef?.current
    if (!root || !itemRef.current) return

    hasBeenVisibleRef.current = false

    const observer = new IntersectionObserver(
      (observerEntries) => {
        observerEntries.forEach((observerEntry) => {
          const rootBounds = observerEntry.rootBounds
          if (!rootBounds) return

          if (observerEntry.isIntersecting) {
            hasBeenVisibleRef.current = true
            return
          }

          const cardRect = observerEntry.boundingClientRect
          if (hasBeenVisibleRef.current && cardRect.top < rootBounds.top) {
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

    return (
      <div
        ref={setRefs}
        className={cn(
          'px-4 py-3 cursor-pointer transition-colors',
          'hover:bg-item-hover',
          isSelected && 'bg-item-active',
          !entry.read && !isSelected && 'bg-accent/5'
        )}
        style={style}
        data-index={dataIndex}
        onClick={onClick}
      >
        {/* Line 1: icon + feed name + time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
          <span className="truncate">{feed?.title || fallbackFeedName}</span>
          {publishedAt && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="shrink-0">{publishedAt}</span>
            </>
          )}
        </div>

        {/* Line 2: title */}
        <div
          className={cn(
            'mt-1 text-sm line-clamp-2',
            !entry.read ? 'font-semibold' : 'font-medium text-muted-foreground'
          )}
        >
          {displayTitle || fallbackTitle}
        </div>

        {/* Line 3: summary */}
        {displaySummary && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {displaySummary}
          </div>
        )}
      </div>
    )
  }
)
