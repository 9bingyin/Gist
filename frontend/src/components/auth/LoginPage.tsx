import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface LoginPageProps {
  onLogin: (identifier: string, password: string) => Promise<void>
  error: string | null
  onClearError: () => void
}

export function LoginPage({ onLogin, error, onClearError }: LoginPageProps) {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!identifier || !password) return

    setIsLoading(true)
    try {
      await onLogin(identifier, password)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo and Title */}
        <div className="text-center">
          <img src="/logo.svg" alt="Gist" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gist</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('auth.login_description')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={onClearError}
              >
                {t('actions.close')}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="identifier" className="text-sm font-medium text-foreground">
              {t('auth.identifier')}
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('auth.identifier_placeholder')}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={isLoading}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password_placeholder')}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !identifier || !password}
            className={cn(
              'inline-flex h-10 w-full items-center justify-center rounded-md',
              'bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            {isLoading ? t('auth.logging_in') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  )
}
