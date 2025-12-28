import { cn } from '@/lib/utils'
import { ProfileButton } from './ProfileButton'

const actionButtonStyles = cn(
  'inline-flex items-center justify-center',
  'rounded-md size-8',
  'hover:bg-accent/50 transition-colors duration-200',
  'disabled:cursor-not-allowed disabled:opacity-50'
)

interface SidebarHeaderProps {
  title?: string
  avatarUrl?: string
  userName?: string
  onAddClick?: () => void
  onSettingsClick?: () => void
  onLogoutClick?: () => void
}

export function SidebarHeader({
  title = 'Gist',
  avatarUrl,
  userName = 'User',
  onAddClick,
  onSettingsClick,
  onLogoutClick,
}: SidebarHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-2.5 pb-2">
      {/* Logo and title */}
      <div className="flex items-center gap-1 text-lg font-semibold">
        <svg
          className="mr-1 size-6 text-primary"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <span>{title}</span>
      </div>

      {/* Action buttons */}
      <div className="relative flex items-center gap-2">
        {/* Add/Discover button */}
        <button
          type="button"
          className={actionButtonStyles}
          onClick={onAddClick}
          aria-label="Add feed"
        >
          <svg
            className="size-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>

        {/* User avatar dropdown */}
        <ProfileButton
          avatarUrl={avatarUrl}
          userName={userName}
          onSettingsClick={onSettingsClick}
          onLogoutClick={onLogoutClick}
        />
      </div>
    </div>
  )
}
