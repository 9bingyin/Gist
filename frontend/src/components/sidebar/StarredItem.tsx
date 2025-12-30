import { cn } from '@/lib/utils'
import { feedItemStyles, sidebarItemIconStyles } from './styles'

interface StarredItemProps {
  isActive?: boolean
  count?: number
  onClick?: () => void
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export function StarredItem({ isActive = false, count = 0, onClick }: StarredItemProps) {
  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'mt-1 pl-2.5')}
      onClick={onClick}
    >
      <span className={sidebarItemIconStyles}>
        <StarIcon className="size-4 -translate-y-px text-amber-500" />
      </span>
      <span className="grow">Starred</span>
      {count > 0 && (
        <span className="text-[0.65rem] tabular-nums text-muted-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}
