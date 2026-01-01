import { useState } from 'react'
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

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

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

  const getIcon = () => {
    switch (activeTab) {
      case 'general':
        return (
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )
      case 'feeds':
        return (
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
            />
          </svg>
        )
      case 'folders':
        return (
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        )
      case 'data':
        return (
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
            />
          </svg>
        )
      case 'ai':
        return (
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.628.105a9 9 0 01-2.507 0l-.628-.105c-1.717-.293-2.3-2.379-1.067-3.61L16.8 15.3m-7.6 0c-1.232 1.232-.65 3.318 1.067 3.611l.628.105a9 9 0 002.507 0l.628-.105c1.717-.293 2.3-2.379 1.067-3.61"
            />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[950px] h-[800px] max-w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0">
        <div className="flex h-full">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <span className="text-muted-foreground">{getIcon()}</span>
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
