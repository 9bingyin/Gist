interface EntryListHeaderProps {
  title: string
  unreadCount: number
  onMarkAllRead: () => void
}

export function EntryListHeader({ title, unreadCount, onMarkAllRead }: EntryListHeaderProps) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {unreadCount > 0 && (
          <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
        )}
      </div>

      {unreadCount > 0 && (
        <button
          type="button"
          onClick={onMarkAllRead}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Mark all read
        </button>
      )}
    </div>
  )
}
