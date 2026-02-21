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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { useFeedViewStore, type FeedViewMode } from '@/stores/feed-view-store'

interface EntryListHeaderProps {
  title: string
  unreadCount: number
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  viewMenuFeedId?: string
  viewMenuDefaultMode?: FeedViewMode
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
  viewMenuFeedId,
  viewMenuDefaultMode,
  scrollToTopScope,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
}: EntryListHeaderProps) {
  const { t } = useTranslation()

  const feedViewMode = useFeedViewStore((s) => {
    if (!viewMenuFeedId) return 'normal'
    return s.getEffectiveMode(viewMenuFeedId, viewMenuDefaultMode ?? 'normal')
  })
  const setFeedViewMode = useFeedViewStore((s) => s.setMode)

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

            {viewMenuFeedId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 [&>span]:order-2 [&>svg]:order-1 [&>svg]:!ml-0"
                  >
                    <span>{t('entry.view')}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={8} alignOffset={-4}>
                    <ViewModeItem
                      active={feedViewMode === 'browser'}
                      label={t('entry.view_browser')}
                      onSelect={() => setFeedViewMode(viewMenuFeedId, 'browser')}
                    />
                    <ViewModeItem
                      active={feedViewMode === 'readability'}
                      label={t('entry.view_readability')}
                      onSelect={() => setFeedViewMode(viewMenuFeedId, 'readability')}
                    />
                    <ViewModeItem
                      active={feedViewMode === 'normal'}
                      label={t('entry.view_normal')}
                      onSelect={() => setFeedViewMode(viewMenuFeedId, 'normal')}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function ViewModeItem({
  active,
  label,
  onSelect,
}: {
  active: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      className={active ? 'font-semibold' : 'font-normal'}
      onSelect={(e) => {
        e.preventDefault()
        onSelect()
      }}
    >
      <span className="flex items-center gap-2">
        <RadioDotIcon selected={active} />
        {label}
      </span>
    </DropdownMenuItem>
  )
}

function RadioDotIcon({ selected }: { selected: boolean }) {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      {selected && <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />}
    </svg>
  )
}
