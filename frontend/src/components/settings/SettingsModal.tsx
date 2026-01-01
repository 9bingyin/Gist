import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsSidebar } from './SettingsSidebar'
import { GeneralSettings } from './tabs/GeneralSettings'
import { DataControl } from './tabs/DataControl'
import { FeedsSettings } from './tabs/FeedsSettings'
import { FoldersSettings } from './tabs/FoldersSettings'
import { AISettings } from './tabs/AISettings'
import { cn } from '@/lib/utils'

export type SettingsTab = 'general' | 'feeds' | 'folders' | 'data' | 'ai'

interface SettingsModalProps {
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

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const isMobile = useMobileDetect()

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'feeds':
        return <FeedsSettings />
      case 'folders':
        return <FoldersSettings />
      case 'data':
        return <DataControl />
      case 'ai':
        return <AISettings />
      default:
        return null
    }
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'general':
        return t('settings.general')
      case 'feeds':
        return t('settings.subscriptions')
      case 'folders':
        return t('settings.folders')
      case 'data':
        return t('settings.data')
      case 'ai':
        return t('settings.ai')
      default:
        return t('settings.title')
    }
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('settings.general') },
    { id: 'feeds', label: t('settings.subscriptions') },
    { id: 'folders', label: t('settings.folders') },
    { id: 'data', label: t('settings.data') },
    { id: 'ai', label: t('settings.ai') },
  ]

  // Mobile layout
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none p-0 overflow-hidden gap-0 rounded-none">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <DialogTitle className="text-lg font-bold">{getTitle()}</DialogTitle>
              <button
                onClick={() => onOpenChange(false)}
                className={cn(
                  'rounded-md p-1.5',
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

            {/* Tab bar */}
            <div className="flex border-b border-border overflow-x-auto shrink-0 bg-muted/30">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                    'border-b-2 -mb-px',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-4 py-4">
              {renderContent()}
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
        <div className="flex h-full">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <DialogTitle className="text-xl font-bold">{getTitle()}</DialogTitle>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {renderContent()}
            </div>

            {/* Close button */}
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                'absolute right-4 top-4 rounded-md p-1.5',
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
