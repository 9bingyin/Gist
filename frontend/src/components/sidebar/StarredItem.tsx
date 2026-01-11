import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { StarIcon } from '@/components/ui/icons'
import { feedItemStyles, sidebarItemIconStyles } from './styles'

interface StarredItemProps {
  isActive?: boolean
  count?: number
  onClick?: () => void
}

export function StarredItem({ isActive = false, count = 0, onClick }: StarredItemProps) {
  const { t } = useTranslation()

  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'mt-1 pl-2.5')}
      onClick={onClick}
    >
      <span className={sidebarItemIconStyles}>
        <StarIcon className="size-4 -translate-y-px text-amber-500" />
      </span>
      <span className="grow">{t('sidebar.starred')}</span>
      {count > 0 && (
        <span className="text-[0.65rem] tabular-nums text-muted-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}
