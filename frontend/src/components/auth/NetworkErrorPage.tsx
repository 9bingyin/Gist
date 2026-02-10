import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface NetworkErrorPageProps {
  onRetry: () => void
}

export function NetworkErrorPage({ onRetry }: NetworkErrorPageProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/logo.svg" alt="Gist" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gist</h1>
          <p className="mt-2 text-base font-medium text-foreground">
            {t('auth.network_error_title')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('auth.network_error_description')}
          </p>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {t('auth.network_error_hint')}
        </div>

        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex h-10 w-full items-center justify-center rounded-md',
            'bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
            'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          {t('auth.retry')}
        </button>
      </div>
    </div>
  )
}
