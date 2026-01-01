import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

type Language = 'zh' | 'en'

export function GeneralSettings() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

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

    </div>
  )
}
