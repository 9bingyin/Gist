import { useState } from 'react'
import { cn } from '@/lib/utils'
import { feedItemStyles, sidebarItemIconStyles } from './styles'

interface FeedItemProps {
  name: string
  iconPath?: string
  unreadCount?: number
  isActive?: boolean
  errorMessage?: string
  onClick?: () => void
  className?: string
}

function RssIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  )
}

function ErrorIcon({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {title && <title>{title}</title>}
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
    </svg>
  )
}

export function FeedItem({
  name,
  iconPath,
  unreadCount,
  isActive = false,
  errorMessage,
  onClick,
  className,
}: FeedItemProps) {
  const [iconError, setIconError] = useState(false)
  const hasError = !!errorMessage

  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'py-0.5', className)}
      onClick={onClick}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', hasError && 'text-red-500')}>
        <span className={sidebarItemIconStyles}>
          {iconPath && !iconError ? (
            <img
              src={`/icons/${iconPath}`}
              alt=""
              className="size-4 rounded-sm object-cover"
              onError={() => setIconError(true)}
            />
          ) : (
            <RssIcon className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="truncate">{name}</span>
        {hasError && <ErrorIcon className="ml-1 size-4 shrink-0" title={errorMessage} />}
      </div>
      {unreadCount !== undefined && unreadCount > 0 && (
        <span className="ml-2 shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
          {unreadCount}
        </span>
      )}
    </div>
  )
}
