import { cn } from '@/lib/utils'
import { feedItemStyles } from './styles'

interface FeedItemProps {
  name: string
  unreadCount?: number
  isActive?: boolean
  onClick?: () => void
  className?: string
}

export function FeedItem({
  name,
  unreadCount,
  isActive = false,
  onClick,
  className,
}: FeedItemProps) {
  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, className)}
      onClick={onClick}
    >
      <span className="grow truncate">{name}</span>
      {unreadCount !== undefined && unreadCount > 0 && (
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          {unreadCount}
        </span>
      )}
    </div>
  )
}
