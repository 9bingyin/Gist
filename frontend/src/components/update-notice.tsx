import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000 // 1 hour

function shouldDisableServiceWorker(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('harmonyos') || ua.includes('arkweb') || ua.includes('huaweibrowser')
}

function registerPeriodicSync(period: number, swUrl: string, r: ServiceWorkerRegistration) {
  if (period <= 0) return

  setInterval(async () => {
    if ('onLine' in navigator && !navigator.onLine) return

    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: {
        cache: 'no-store',
        'cache-control': 'no-cache',
      },
    })

    if (resp?.status === 200) await r.update()
  }, period)
}

export function UpdateNotice() {
  if (shouldDisableServiceWorker()) return null

  const { t } = useTranslation()

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (UPDATE_CHECK_INTERVAL <= 0) return
      if (r?.active?.state === 'activated') {
        registerPeriodicSync(UPDATE_CHECK_INTERVAL, swUrl, r)
      } else if (r?.installing) {
        r.installing.addEventListener('statechange', (e) => {
          const sw = e.target as ServiceWorker
          if (sw.state === 'activated') registerPeriodicSync(UPDATE_CHECK_INTERVAL, swUrl, r)
        })
      }
    },
  })

  const handleClick = () => {
    updateServiceWorker(true)
  }

  if (!needRefresh) return null

  return (
    <div
      className={cn(
        'fixed right-6 bottom-6 z-50 cursor-pointer',
        'mb-[env(safe-area-inset-bottom,0px)]'
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-2.5',
          'bg-background/95 backdrop-blur-sm',
          'border border-primary/20',
          'shadow-lg shadow-primary/10',
          'transition-all duration-200',
          'hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/15',
          'active:scale-[0.98]'
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center">
          <Download className="size-5 text-primary" />
        </div>
        <div className="min-w-0 text-left">
          <div className="text-sm font-medium text-foreground">
            {t('update.available')}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('update.description')}
          </div>
        </div>
      </div>
    </div>
  )
}
