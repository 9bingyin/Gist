import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RootPortal } from '@/components/ui/portal'
import useMeasure from 'react-use-measure'

const menuItemStyles = cn(
  'group relative flex cursor-pointer select-none items-center gap-2',
  'rounded-[5px] px-2.5 py-1 text-sm font-medium',
  'text-foreground/90 outline-none transition-colors duration-150',
  'focus:bg-accent/30 data-[highlighted]:bg-accent/20',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  'h-[28px]'
)

interface ProfileButtonProps {
  avatarUrl?: string
  userName?: string
  onSettingsClick?: () => void
  onLogoutClick?: () => void
}

const UserAvatar = React.forwardRef<
  HTMLSpanElement,
  {
    className?: string
    avatarUrl?: string
    style?: React.CSSProperties
    onTransitionEnd?: () => void
    hideName?: boolean
  }
>(({ className, avatarUrl, style, onTransitionEnd }, ref) => (
  <span
    ref={ref}
    style={style}
    onTransitionEnd={onTransitionEnd}
    className={cn(
      'relative flex shrink-0 overflow-hidden rounded-full border bg-muted',
      className
    )}
  >
    {avatarUrl ? (
      <img className="size-full object-cover" src={avatarUrl} alt="User avatar" />
    ) : (
      <svg
        className="size-full p-1 text-muted-foreground"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    )}
  </span>
))
UserAvatar.displayName = 'UserAvatar'

const TransitionAvatar = React.forwardRef<
  HTMLButtonElement,
  {
    stage: 'zoom-in' | ''
    avatarUrl?: string
  } & React.HTMLAttributes<HTMLButtonElement>
>(({ stage, avatarUrl, className, ...props }, forwardRef) => {
  const [measureRef, { x, y }, forceRefresh] = useMeasure()
  const [avatarHovered, setAvatarHovered] = React.useState(false)

  const zoomIn = stage === 'zoom-in'
  const [currentZoomIn, setCurrentZoomIn] = React.useState(false)

  React.useLayoutEffect(() => {
    if (zoomIn) {
      setCurrentZoomIn(true)
    }
  }, [zoomIn])

  return (
    <>
      <button
        {...props}
        ref={forwardRef}
        className={cn(
            "group relative inline-flex items-center justify-center rounded-md size-8 outline-none focus-visible:ring-0",
            className
        )}
        onMouseEnter={React.useCallback(() => {
          forceRefresh()
          setAvatarHovered(true)
        }, [forceRefresh])}
        onMouseLeave={React.useCallback(() => {
          setAvatarHovered(false)
        }, [])}
      >
        <UserAvatar ref={measureRef} className="size-6 border-0" avatarUrl={avatarUrl} />
      </button>

      {x !== 0 && y !== 0 && (avatarHovered || zoomIn || currentZoomIn) && (
        <RootPortal>
          <UserAvatar
            avatarUrl={avatarUrl}
            style={{
              left: x - (zoomIn ? 16 : 0),
              top: y,
            }}
            className={cn(
              "fixed p-0 border-0 pointer-events-none",
              "transition-all duration-200 ease-in-out",
              "transform-gpu will-change-[left,top,height,width]",
              zoomIn ? "z-[100] size-14" : "z-[-1] size-6"
            )}
            onTransitionEnd={() => {
              if (!zoomIn && currentZoomIn) {
                setCurrentZoomIn(false)
              }
            }}
          />
        </RootPortal>
      )}
    </>
  )
})
TransitionAvatar.displayName = 'TransitionAvatar'

export function ProfileButton({
  avatarUrl,
  userName = 'User',
  onSettingsClick,
  onLogoutClick,
}: ProfileButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const iconStyles =
    'size-4 text-muted-foreground transition-colors group-data-[highlighted]:text-foreground'
  const contentStyle: React.CSSProperties = {
     backgroundImage: "linear-gradient(to bottom right, hsl(var(--background) / 0.98), hsl(var(--background) / 0.95))",
     boxShadow: `
       0 6px 20px rgba(0, 0, 0, 0.08), 
       0 4px 12px rgba(0, 0, 0, 0.05), 
       0 2px 6px rgba(0, 0, 0, 0.04), 
       0 4px 16px hsl(var(--primary) / 0.06), 
       0 2px 8px hsl(var(--primary) / 0.04), 
       0 1px 3px rgba(0, 0, 0, 0.03)
     `,
  }
  const glowStyle: React.CSSProperties = {
    background: "linear-gradient(to bottom right, hsl(var(--primary) / 0.02), transparent, hsl(var(--primary) / 0.02))"
  }

  return (
    <DropdownMenu onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <TransitionAvatar 
            stage={isOpen ? 'zoom-in' : ''} 
            avatarUrl={avatarUrl}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={cn(
            "min-w-[240px] p-1 overflow-visible !animate-none",
            "backdrop-blur-2xl",
            "motion-scale-in-75 motion-duration-150 motion-ease-out",
            "data-[state=closed]:motion-scale-out-95 data-[state=closed]:motion-opacity-out-0",
            "border-border/40"
        )}
        style={contentStyle}
        side="bottom"
        align="center"
        sideOffset={10}
      >
        <div className="pointer-events-none absolute inset-0 rounded-md" style={glowStyle} />

        {/* User info */}
        <DropdownMenuLabel className="px-2 pb-3 pt-6 relative z-10 text-center">
            <div className="flex flex-col items-center justify-center">
              <div className="max-w-[20ch] truncate text-lg font-semibold tracking-tight text-foreground">
                {userName}
              </div>
              <div className="mt-0.5 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground/80">
                  <span>Free Plan</span>
              </div>
            </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Profile */}
        <DropdownMenuItem className={menuItemStyles}>
          <span className="inline-flex size-4 items-center justify-center">
             <i className="size-4 rounded-full border border-current opacity-50" />
          </span>
          <span>Profile</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Settings */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onSettingsClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <svg className={iconStyles} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <span>Settings</span>
          <DropdownMenuShortcut>Ctrl+,</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Logout */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onLogoutClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <svg className={iconStyles} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </span>
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}