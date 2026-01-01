import { useTranslation } from 'react-i18next'

interface EntryListHeaderProps {
  title: string
  unreadCount: number
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onMarkAllRead: () => void
  isMobile?: boolean
  onMenuClick?: () => void
}

function CircleOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function CircleFilledIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function EntryListHeader({
  title,
  unreadCount,
  unreadOnly,
  onToggleUnreadOnly,
  onMarkAllRead,
  isMobile,
  onMenuClick,
}: EntryListHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-14 items-center justify-between gap-4 px-4 shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isMobile && onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-item-hover"
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
