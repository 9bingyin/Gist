import { forwardRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'
import { stripHtml } from '@/lib/html-utils'
import { buildInlineMetaText } from '@/lib/text-truncate'
import { useTranslationStore } from '@/stores/translation-store'
import { FeedIcon } from '@/components/ui/feed-icon'
import type { Entry, Feed } from '@/types/api'

interface EntryListItemProps {
  entry: Entry
  feed?: Feed
  containerWidth?: number
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
      containerWidth,
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
  const fallbackTitle = t('entry.untitled')
  const fallbackFeedName = t('entry.unknown_feed')
  const metaTextMaxWidth =
    containerWidth && Number.isFinite(containerWidth)
      ? Math.max(Math.floor(containerWidth) - 32 - 16 - 6, 1)
      : null


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
    const displayFeedName = feed?.title || fallbackFeedName
    const inlineMetaText = metaTextMaxWidth
      ? buildInlineMetaText(displayFeedName, publishedAt, metaTextMaxWidth)
      : publishedAt
        ? `${displayFeedName} · ${publishedAt}`
        : displayFeedName

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
          <span className="block min-w-0 flex-1 truncate">{inlineMetaText}</span>
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
