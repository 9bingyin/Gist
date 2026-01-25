import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  starredCount?: number
  isStarredSelected?: boolean
  onStarredClick?: () => void
  onProfileClick?: () => void
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
       'relative flex shrink-0 overflow-hidden rounded-full border bg-muted select-none',
       className
     )}
   >
     {avatarUrl ? (
       <img className="size-full object-cover" src={avatarUrl} alt="" />
     ) : (
       <svg
         className="size-full p-1 text-muted-foreground"
         fill="currentColor"
         viewBox="0 0 24 24"
       >
         <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4 1.79-4 4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
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
  const zoomIn = stage === 'zoom-in'

  return (
    <>
      <button
        {...props}
        ref={forwardRef}
        className={cn(
            "group relative inline-flex items-center justify-center rounded-md size-8 outline-none focus-visible:ring-0 select-none",
            className
        )}
        onPointerDown={React.useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
          forceRefresh()
          props.onPointerDown?.(e)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [forceRefresh, props.onPointerDown])}
        onClick={React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
          forceRefresh()
          props.onClick?.(e)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [forceRefresh, props.onClick])}
      >
        <UserAvatar ref={measureRef} className="size-6 border-0" avatarUrl={avatarUrl} />
      </button>

      <RootPortal>
        <AnimatePresence>
          {zoomIn && x !== 0 && y !== 0 && (
            <motion.div
              initial={{
                left: x,
                top: y,
                width: 24,
                height: 24,
                opacity: 0.5,
              }}
              animate={{
                left: x - 16,
                top: y,
                width: 56,
                height: 56,
                opacity: 1,
              }}
              exit={{
                left: x,
                top: y,
                width: 24,
                height: 24,
                opacity: 0,
              }}
              transition={{
                duration: 0.2,
                ease: [0.4, 0, 0.2, 1], // Standard Ease
              }}
              className="fixed p-0 border-0 pointer-events-none rounded-full overflow-hidden bg-muted z-[100] transform-gpu shadow-xl select-none"
            >
              {avatarUrl ? (
                <img className="size-full object-cover" src={avatarUrl} alt="" />
              ) : (
                <svg
                  className="size-full p-1 text-muted-foreground"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4 1.79-4 4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </RootPortal>
    </>
  )
})
TransitionAvatar.displayName = 'TransitionAvatar'

export function ProfileButton({
  avatarUrl,
  userName,
  starredCount = 0,
  isStarredSelected = false,
  onStarredClick,
  onProfileClick,
  onSettingsClick,
  onLogoutClick,
}: ProfileButtonProps) {
  const { t } = useTranslation()
  const displayName = userName || t('user.guest')
  const [isOpen, setIsOpen] = React.useState(false)
  const iconStyles =
    'size-4 text-muted-foreground transition-colors group-data-[highlighted]:text-foreground'

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
            "border-border/40",
            "bg-[linear-gradient(to_bottom_right,_hsl(var(--background)_/_0.98),_hsl(var(--background)_/_0.95))]",
            "shadow-[0_6px_20px_rgba(0,0,0,0.08),_0_4px_12px_rgba(0,0,0,0.05),_0_2px_6px_rgba(0,0,0,0.04),_0_4px_16px_hsl(var(--primary)_/_0.06),_0_2px_8px_hsl(var(--primary)_/_0.04),_0_1px_3px_rgba(0,0,0,0.03)]"
        )}
        side="bottom"
        align="center"
        sideOffset={10}
      >
        <div className="pointer-events-none absolute inset-0 rounded-md bg-[linear-gradient(to_bottom_right,_hsl(var(--primary)_/_0.02),_transparent,_hsl(var(--primary)_/_0.02))]" />

        {/* User info */}
        <DropdownMenuLabel className="px-2 pb-3 pt-6 relative z-10 text-center">
            <div className="flex flex-col items-center justify-center">
              <div className="max-w-[20ch] truncate text-lg font-semibold tracking-tight text-foreground">
                {displayName}
              </div>
            </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Profile */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onProfileClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <svg className={iconStyles} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </span>
          <span>{t('user.profile')}</span>
        </DropdownMenuItem>

        {/* Starred */}
        <DropdownMenuItem
          className={cn(menuItemStyles, isStarredSelected && 'bg-accent/30')}
          onSelect={onStarredClick}
        >
          <span className="inline-flex size-4 items-center justify-center">
            <svg className={iconStyles} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </span>
          <span>{t('sidebar.starred')}</span>
          {starredCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{starredCount}</span>
          )}
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
          <span>{t('settings.title')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50" />

        {/* Logout */}
        <DropdownMenuItem className={menuItemStyles} onSelect={onLogoutClick}>
          <span className="inline-flex size-4 items-center justify-center">
            <svg className={iconStyles} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </span>
          <span>{t('user.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
