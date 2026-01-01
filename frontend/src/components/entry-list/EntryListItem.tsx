import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTranslationStore } from '@/stores/translation-store'
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

    // Use translated content if available
    const displayTitle = translation?.title ?? entry.title
    const displaySummary = translation?.summary ?? (entry.content ? stripHtml(entry.content).slice(0, 150) : null)

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

function FeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
    </svg>
  )
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

function formatRelativeTime(dateString: string, t: (key: string, options?: any) => string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return t('add_feed.just_now')
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return t('add_feed.minutes_ago', { count: minutes })
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return t('add_feed.hours_ago', { count: hours })
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return t('add_feed.days_ago', { count: days })
  }

  return date.toLocaleDateString()
}
