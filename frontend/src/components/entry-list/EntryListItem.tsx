import { forwardRef, useState, useMemo } from 'react'
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
    },
    ref
  ) {
    const { t } = useTranslation()
    const publishedAt = entry.publishedAt ? formatRelativeTime(entry.publishedAt, t) : null
    const [iconError, setIconError] = useState(false)
    const showIcon = feed?.iconPath && !iconError

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

    return (
      <div
        ref={ref}
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
          <span className="truncate">{feed?.title || 'Unknown Feed'}</span>
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
          {displayTitle || 'Untitled'}
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
