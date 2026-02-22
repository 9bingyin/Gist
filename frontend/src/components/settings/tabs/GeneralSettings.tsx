import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getGeneralSettings, updateGeneralSettings } from '@/api'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { SegmentedControl } from '@/components/ui/segmented-control'

type Language = 'zh' | 'en'

export function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [fallbackUA, setFallbackUA] = useState('')
  const [autoReadability, setAutoReadability] = useState(false)
  const [markReadOnScroll, setMarkReadOnScroll] = useState(false)
  const [defaultShowUnread, setDefaultShowUnread] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    getGeneralSettings().then((settings) => {
      setFallbackUA(settings.fallbackUserAgent || '')
      setAutoReadability(settings.autoReadability || false)
      setMarkReadOnScroll(settings.markReadOnScroll || false)
      setDefaultShowUnread(settings.defaultShowUnread || false)
    }).catch(() => {
      // ignore
    })
  }, [])

  const handleSaveFallbackUA = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability, markReadOnScroll, defaultShowUnread })
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAutoReadabilityChange = useCallback(async (checked: boolean) => {
    setAutoReadability(checked)
    try {
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability: checked, markReadOnScroll, defaultShowUnread })
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
    } catch {
      // Revert on error
      setAutoReadability(!checked)
    }
  }, [fallbackUA, markReadOnScroll, defaultShowUnread, queryClient])

  const handleMarkReadOnScrollChange = useCallback(async (checked: boolean) => {
    setMarkReadOnScroll(checked)
    try {
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability, markReadOnScroll: checked, defaultShowUnread })
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
    } catch {
      // Revert on error
      setMarkReadOnScroll(!checked)
    }
  }, [fallbackUA, autoReadability, defaultShowUnread, queryClient])

  const handleDefaultShowUnreadChange = useCallback(async (checked: boolean) => {
    setDefaultShowUnread(checked)
    try {
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability, markReadOnScroll, defaultShowUnread: checked })
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
    } catch {
      // Revert on error
      setDefaultShowUnread(!checked)
    }
  }, [fallbackUA, autoReadability, markReadOnScroll, queryClient])

  const languageOptions = useMemo(() => [
    { value: 'zh' as Language, label: t('language.zh') },
    { value: 'en' as Language, label: t('language.en') },
  ], [t])

  const changeLanguage = (lng: Language) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('gist-lang', lng)
  }

  return (
    <div className="space-y-6">
      {/* Language Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('language.label')}</div>
            <div className="text-xs text-muted-foreground">{t('language.description')}</div>
          </div>
          <SegmentedControl
            className="shrink-0"
            value={(i18n.language as Language) || 'zh'}
            onValueChange={changeLanguage}
            options={languageOptions}
          />
        </div>
      </section>

      {/* Auto Readability Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('settings.auto_readability')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.auto_readability_description')}</div>
          </div>
          <Switch
            checked={autoReadability}
            onCheckedChange={handleAutoReadabilityChange}
          />
        </div>
      </section>

      {/* Mark Read On Scroll Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('settings.mark_read_on_scroll')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.mark_read_on_scroll_description')}</div>
          </div>
          <Switch
            checked={markReadOnScroll}
            onCheckedChange={handleMarkReadOnScrollChange}
          />
        </div>
      </section>

      {/* Default Show Unread Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('settings.default_show_unread')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.default_show_unread_description')}</div>
          </div>
          <Switch
            checked={defaultShowUnread}
            onCheckedChange={handleDefaultShowUnreadChange}
          />
        </div>
      </section>

      {/* Advanced Section */}
      <section>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('settings.advanced')}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('settings.fallback_ua')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.fallback_ua_description')}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              type="text"
              value={fallbackUA}
              onChange={(e) => setFallbackUA(e.target.value)}
              placeholder={t('settings.fallback_ua_placeholder')}
              className={cn(
                'h-9 w-64 max-w-full rounded-md border border-border bg-background px-3 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
            />
            <button
              type="button"
              onClick={handleSaveFallbackUA}
              disabled={isSaving}
              className={cn(
                'h-9 rounded-md px-3 text-sm font-medium transition-colors shrink-0',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                saveStatus === 'success' && 'bg-green-600 hover:bg-green-600',
                saveStatus === 'error' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isSaving ? t('settings.saving') : saveStatus === 'success' ? t('settings.saved') : t('settings.save')}
            </button>
          </div>
        </div>
      </section>

    </div>
  )
}
