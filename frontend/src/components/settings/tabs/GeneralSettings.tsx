import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { getGeneralSettings, updateGeneralSettings } from '@/api'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

type Language = 'zh' | 'en'

export function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [fallbackUA, setFallbackUA] = useState('')
  const [autoReadability, setAutoReadability] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    getGeneralSettings().then((settings) => {
      setFallbackUA(settings.fallbackUserAgent || '')
      setAutoReadability(settings.autoReadability || false)
    }).catch(() => {
      // ignore
    })
  }, [])

  const handleSaveFallbackUA = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability })
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
      await updateGeneralSettings({ fallbackUserAgent: fallbackUA, autoReadability: checked })
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
    } catch {
      // Revert on error
      setAutoReadability(!checked)
    }
  }, [fallbackUA, queryClient])

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: 'system',
      label: t('theme.system'),
      icon: (
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      value: 'light',
      label: t('theme.light'),
      icon: (
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      value: 'dark',
      label: t('theme.dark'),
      icon: (
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ),
    },
  ]

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'zh', label: t('language.zh') },
    { value: 'en', label: t('language.en') },
  ]

  const changeLanguage = (lng: Language) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('gist-lang', lng)
  }

  return (
    <div className="space-y-6">
      {/* Language Section */}
      <section>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('language.label')}</div>
              <div className="text-xs text-muted-foreground">{t('language.description')}</div>
            </div>

            <div className="flex rounded-lg border border-border bg-muted/30 p-1">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeLanguage(option.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                    i18n.language === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Theme Section */}
      <section>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('theme.label')}</div>
              <div className="text-xs text-muted-foreground">{t('theme.description')}</div>
            </div>

            <div className="flex rounded-lg border border-border bg-muted/30 p-1">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                    theme === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Auto Readability Section */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t('settings.auto_readability')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.auto_readability_description')}</div>
          </div>
          <Switch
            checked={autoReadability}
            onCheckedChange={handleAutoReadabilityChange}
          />
        </div>
      </section>

      {/* Advanced Section */}
      <section>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('settings.advanced')}
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">{t('settings.fallback_ua')}</div>
            <div className="mb-2 text-xs text-muted-foreground">{t('settings.fallback_ua_description')}</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={fallbackUA}
                onChange={(e) => setFallbackUA(e.target.value)}
                placeholder={t('settings.fallback_ua_placeholder')}
                className={cn(
                  'flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                )}
              />
              <button
                type="button"
                onClick={handleSaveFallbackUA}
                disabled={isSaving}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-medium transition-colors',
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
        </div>
      </section>

    </div>
  )
}
