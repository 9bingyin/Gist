import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyLang = (lng: string) => {
      document.documentElement.lang = lng === 'zh' ? 'zh-CN' : 'en'
    }

    const saved = localStorage.getItem('gist-lang')
    if (saved && (saved === 'zh' || saved === 'en')) {
      i18n.changeLanguage(saved)
      applyLang(saved)
    } else {
      const browser = navigator.language || 'en'
      const base = browser.split('-')[0]
      const detected = base === 'zh' ? 'zh' : 'en'
      i18n.changeLanguage(detected)
      applyLang(detected)
    }

    const onChange = (lng: string) => applyLang(lng)
    i18n.on('languageChanged', onChange)
    return () => {
      i18n.off('languageChanged', onChange)
    }
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
