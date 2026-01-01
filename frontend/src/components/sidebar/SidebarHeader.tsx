import { useTranslation } from 'react-i18next'
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

function GistLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

function AddIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SidebarHeader({
  title = 'Gist',
  avatarUrl,
  userName = 'User',
  onAddClick,
  onSettingsClick,
  onLogoutClick,
}: SidebarHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
      {/* Logo and title */}
      <div className="flex items-center gap-1.5 text-lg font-semibold">
        <GistLogo className="size-7 text-primary" />
        <span className="tracking-tight">{title}</span>
      </div>

      {/* Action buttons */}
      <div className="relative flex items-center gap-1">
        {/* Add/Discover button */}
        <button
          type="button"
          className={actionButtonStyles}
          onClick={onAddClick}
          aria-label={t('actions.add_feed')}
        >
          <AddIcon className="size-5 text-muted-foreground" />
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
