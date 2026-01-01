import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enTranslations from '../../public/locales/en/common.json'
import zhTranslations from '../../public/locales/zh/common.json'

const resources = {
  en: {
    common: enTranslations,
  },
  zh: {
    common: zhTranslations,
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export default i18n
