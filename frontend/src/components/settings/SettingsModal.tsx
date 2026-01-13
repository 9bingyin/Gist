import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsSidebar } from './SettingsSidebar'
import { GeneralSettings } from './tabs/GeneralSettings'
import { AppearanceSettings } from './tabs/AppearanceSettings'
import { DataControl } from './tabs/DataControl'
import { FeedsSettings } from './tabs/FeedsSettings'
import { FoldersSettings } from './tabs/FoldersSettings'
import { AISettings } from './tabs/AISettings'
import { NetworkSettings } from './tabs/NetworkSettings'
import { AdvancedSettings } from './tabs/AdvancedSettings'
import { cn } from '@/lib/utils'

export type SettingsTab = 'general' | 'network' | 'appearance' | 'ai' | 'data' | 'feeds' | 'folders' | 'advanced'

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

  // Reset to general when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('general')
    }
  }, [open])

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'network':
        return <NetworkSettings />
      case 'appearance':
        return <AppearanceSettings />
      case 'ai':
        return <AISettings />
      case 'data':
        return <DataControl />
      case 'feeds':
        return <FeedsSettings />
      case 'folders':
        return <FoldersSettings />
      case 'advanced':
        return <AdvancedSettings />
      default:
        return null
    }
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'general':
        return t('settings.general')
      case 'network':
        return t('settings.network')
      case 'appearance':
        return t('settings.appearance')
      case 'ai':
        return t('settings.ai')
      case 'data':
        return t('settings.data')
      case 'feeds':
        return t('settings.subscriptions')
      case 'folders':
        return t('settings.folders')
      case 'advanced':
        return t('settings.advanced')
      default:
        return t('settings.title')
    }
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('settings.general') },
    { id: 'network', label: t('settings.network') },
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'ai', label: t('settings.ai') },
    { id: 'data', label: t('settings.data') },
    { id: 'feeds', label: t('settings.subscriptions') },
    { id: 'folders', label: t('settings.folders') },
    { id: 'advanced', label: t('settings.advanced') },
  ]

  // Mobile layout
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 w-screen h-screen max-w-none max-h-none p-0 overflow-hidden gap-0 rounded-none">
          <div className="flex h-full flex-col safe-area-inset">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <div className="relative flex-1">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
                  className={cn(
                    'w-full h-9 appearance-none rounded-md border border-border bg-background pl-3 pr-8 text-base font-medium',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                  )}
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
