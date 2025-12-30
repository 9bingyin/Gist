import { useState } from 'react'
import { cn } from '@/lib/utils'
import { feedItemStyles, sidebarItemIconStyles } from './styles'

interface FeedItemProps {
  name: string
  iconPath?: string
  unreadCount?: number
  isActive?: boolean
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

export function FeedItem({
  name,
  iconPath,
  unreadCount,
  isActive = false,
  onClick,
  className,
}: FeedItemProps) {
  const [iconError, setIconError] = useState(false)

  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'py-0.5', className)}
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
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
      </div>
      {unreadCount !== undefined && unreadCount > 0 && (
        <span className="ml-2 shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
          {unreadCount}
        </span>
      )}
    </div>
  )
}
