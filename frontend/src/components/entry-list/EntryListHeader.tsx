import { useTranslation } from 'react-i18next'
import {
  CircleOutlineIcon,
  CircleFilledIcon,
  CheckCircleIcon,
  MenuIcon,
} from '@/components/ui/icons'

interface EntryListHeaderProps {
  title: string
  unreadCount: number
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  isMobile?: boolean
  onMenuClick?: () => void
  isTablet?: boolean
  onToggleSidebar?: () => void
  sidebarVisible?: boolean
}

export function EntryListHeader({
  title,
  unreadCount,
  unreadOnly,
  onToggleUnreadOnly,
  onMarkAllRead,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
}: EntryListHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-14 items-center justify-between gap-4 px-4 shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isMobile && onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-item-hover -ml-1.5"
          >
            <MenuIcon className="size-5" />
          </button>
        )}
        {isTablet && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarVisible ? t('actions.hide_sidebar') : t('actions.show_sidebar')}
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition-all duration-200 hover:bg-item-hover active:scale-95 -ml-1.5"
            style={{
              transitionTimingFunction: 'var(--ease-ios)',
            }}
          >
            <MenuIcon className="size-5" />
          </button>
        )}
        <h2 className="truncate text-lg font-bold">{title}</h2>
        {unreadCount > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">{t('entry.unread_count', { count: unreadCount })}</span>
        )}
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleUnreadOnly}
          title={unreadOnly ? t('entry.show_all') : t('entry.show_unread_only')}
          className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-item-hover"
        >
          {unreadOnly ? (
            <CircleFilledIcon className="size-5" />
          ) : (
            <CircleOutlineIcon className="size-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onMarkAllRead}
          title={t('entry.mark_all_read')}
          className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-item-hover"
        >
          <CheckCircleIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
