import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Entry } from '@/types/api'

interface EntryListItemProps {
  entry: Entry
  isSelected: boolean
  onClick: () => void
  style?: React.CSSProperties
  'data-index'?: number
}

export function EntryListItem({
  entry,
  isSelected,
  onClick,
  style,
  'data-index': dataIndex,
}: EntryListItemProps) {
  const publishedAt = entry.publishedAt ? formatRelativeTime(entry.publishedAt) : null
  const [thumbnailError, setThumbnailError] = useState(false)
  const showThumbnail = entry.thumbnailUrl && !thumbnailError

  return (
    <div
      className={cn(
        'px-4 py-3 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-muted',
        !entry.read && !isSelected && 'bg-accent/5'
      )}
      style={style}
      data-index={dataIndex}
      onClick={onClick}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-sm line-clamp-1',
              !entry.read ? 'font-semibold' : 'font-medium text-muted-foreground'
            )}
          >
            {entry.title || 'Untitled'}
          </div>

          {entry.content && (
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {stripHtml(entry.content).slice(0, 150)}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {entry.author && <span>{entry.author}</span>}
            {publishedAt && <span>{publishedAt}</span>}
          </div>
        </div>

        {showThumbnail && (
          <div className="shrink-0">
            <img
              src={entry.thumbnailUrl}
              alt=""
              className="size-16 rounded-md object-cover"
              onError={() => setThumbnailError(true)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return date.toLocaleDateString()
}
