import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from '@/lib/queryClient'
import { I18nProvider } from '@/components/i18n-provider'

const BOOT_READY_ATTR = 'data-gist-boot-ready'
const BOOT_DONE_ATTR = 'data-gist-booted'
const BOOT_SOFT_PARAM = '_boot_soft'
const BOOT_HARD_PARAM = '_boot_hard'
const bootStartTime = performance.now()

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function logBoot(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info('[boot]', message)
    return
  }
  console.info('[boot]', message, detail)
}

function markBootReady(): void {
  window.__GIST_BOOT_READY__ = true
  document.documentElement.setAttribute(BOOT_READY_ATTR, '1')
  // Signal the watchdog in index.html that boot completed to avoid recovery reload loops.
  document.documentElement.setAttribute(BOOT_DONE_ATTR, '1')

  const url = new URL(window.location.href)
  let changed = false
  if (url.searchParams.has(BOOT_SOFT_PARAM)) {
    url.searchParams.delete(BOOT_SOFT_PARAM)
    changed = true
  }
  if (url.searchParams.has(BOOT_HARD_PARAM)) {
    url.searchParams.delete(BOOT_HARD_PARAM)
    changed = true
  }

  if (changed) {
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  logBoot('react mounted', { boot_ms: Math.round(performance.now() - bootStartTime) })
}

window.addEventListener('error', (event) => {
  console.error('[boot] window error', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[boot] unhandled rejection', event.reason)
})

// BFCache restore: invalidate all queries to ensure fresh data
// when the page is restored from back-forward cache (e.g. Android PWA re-enter)
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return

  logBoot('pageshow restored from bfcache, invalidating queries')
  queryClient.invalidateQueries()
})

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as NavigatorWithStandalone).standalone === true

logBoot('main entry executed', {
  is_standalone: isStandalone,
  visibility_state: document.visibilityState,
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistration()
    .then((registration) => {
      if (!registration) {
        logBoot('service worker status', { registered: false })
        return
      }

      logBoot('service worker status', {
        registered: true,
        has_controller: !!navigator.serviceWorker.controller,
        active_state: registration.active?.state ?? null,
        waiting_state: registration.waiting?.state ?? null,
      })
    })
    .catch((error) => {
      console.error('[boot] failed to read service worker status', error)
    })
}

const appTree = (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <App />
    </I18nProvider>
  </QueryClientProvider>
)

// Avoid double render/fetch on initial load in dev by only enabling StrictMode during development.
const rootNode = import.meta.env.DEV ? <StrictMode>{appTree}</StrictMode> : appTree

createRoot(document.getElementById('root')!).render(rootNode)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    markBootReady()
  })
})
