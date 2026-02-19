import { useTranslation } from 'react-i18next'
import {
  CheckCircleIcon,
  MenuIcon,
  MoreVerticalIcon,
} from '@/components/ui/icons'
import { dispatchScrollToTop } from '@/hooks/useScrollToTop'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

interface EntryListHeaderProps {
  title: string
  unreadCount: number
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  scrollToTopScope?: string
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
  scrollToTopScope,
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
            className="flex size-11 shrink-0 items-center justify-center rounded-md transition-all duration-200 ease-[var(--ease-ios)] hover:bg-item-hover active:scale-95 -ml-1.5"
          >
            <MenuIcon className="size-5" />
          </button>
        )}
        <h2
          className="truncate text-lg font-bold cursor-pointer active:opacity-70 transition-opacity"
          onClick={() => dispatchScrollToTop(scrollToTopScope)}
        >
          {title}
        </h2>
        {unreadCount > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">{t('entry.unread_count', { count: unreadCount })}</span>
        )}
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={onMarkAllRead}
          title={t('entry.mark_all_read')}
          className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-item-hover"
        >
          <CheckCircleIcon className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={unreadOnly ? t('entry.show_all') : t('entry.show_unread_only')}
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-item-hover"
            >
              <MoreVerticalIcon className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuItem
              className={unreadOnly ? 'font-semibold' : 'font-normal'}
              onSelect={() => {
                if (!unreadOnly) onToggleUnreadOnly()
              }}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                </svg>
                {t('entry.filter_unread')}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={!unreadOnly ? 'font-semibold' : 'font-normal'}
              onSelect={() => {
                if (unreadOnly) onToggleUnreadOnly()
              }}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M17 6.1H3" />
                  <path d="M21 12.1H3" />
                  <path d="M15.1 18H3" />
                </svg>
                {t('entry.filter_all')}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
