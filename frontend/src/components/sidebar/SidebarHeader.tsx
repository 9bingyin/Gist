import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { AddIcon } from '@/components/ui/icons'
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
  starredCount?: number
  isStarredSelected?: boolean
  onAddClick?: () => void
  onStarredClick?: () => void
  onProfileClick?: () => void
  onSettingsClick?: () => void
  onLogoutClick?: () => void
}

function GistLogo({ className }: { className?: string }) {
  return (
    <img src="/logo.svg" alt="Gist" className={cn(className, 'rounded')} />
  )
}

export function SidebarHeader({
  title = 'Gist',
  avatarUrl,
  userName = 'User',
  starredCount,
  isStarredSelected,
  onAddClick,
  onStarredClick,
  onProfileClick,
  onSettingsClick,
  onLogoutClick,
}: SidebarHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
      {/* Logo and title */}
      <div className="flex items-center gap-1 text-lg font-semibold">
        <GistLogo className="mr-1 size-6" />
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
          starredCount={starredCount}
          isStarredSelected={isStarredSelected}
          onStarredClick={onStarredClick}
          onProfileClick={onProfileClick}
          onSettingsClick={onSettingsClick}
          onLogoutClick={onLogoutClick}
        />
      </div>
    </div>
  )
}
