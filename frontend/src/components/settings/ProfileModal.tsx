import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProfileSettings } from './tabs/ProfileSettings'
import { cn } from '@/lib/utils'

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MOBILE_BREAKPOINT = 768

function useMobileDetect() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { t } = useTranslation()
  const isMobile = useMobileDetect()

  // Mobile layout
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 w-screen h-screen max-w-none max-h-none p-0 overflow-hidden gap-0 rounded-none">
          <div className="flex h-full flex-col safe-area-inset">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <DialogTitle className="text-lg font-bold">{t('profile.title')}</DialogTitle>
              <button
                onClick={() => onOpenChange(false)}
                className={cn(
                  'rounded-md p-1.5 shrink-0',
                  'text-muted-foreground hover:text-foreground hover:bg-accent',
                  'transition-colors focus:outline-none'
                )}
                aria-label={t('entry.close')}
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-4 py-4">
              <ProfileSettings />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Desktop layout
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[950px] h-[800px] max-w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <DialogTitle className="text-xl font-bold">{t('profile.title')}</DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                'rounded-md p-1.5',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label={t('entry.close')}
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <ProfileSettings />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
