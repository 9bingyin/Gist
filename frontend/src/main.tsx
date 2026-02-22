import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from '@/lib/queryClient'
import { I18nProvider } from '@/components/i18n-provider'

// BFCache restore: invalidate all queries to ensure fresh data
// when the page is restored from back-forward cache (e.g. Android PWA re-enter)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    queryClient.invalidateQueries()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
