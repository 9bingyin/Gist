import { cn } from '@/lib/utils'
import { feedItemStyles } from './styles'

interface StarredItemProps {
  isActive?: boolean
  onClick?: () => void
}

export function StarredItem({ isActive = false, onClick }: StarredItemProps) {
  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'mt-1')}
      onClick={onClick}
    >
      <svg
        className="mr-2 size-4 text-amber-500"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <span className="grow">Starred</span>
    </div>
  )
}
