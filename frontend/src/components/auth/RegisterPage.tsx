import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface RegisterPageProps {
  onRegister: (username: string, nickname: string, email: string, password: string) => Promise<void>
  error: string | null
  onClearError: () => void
}

export function RegisterPage({ onRegister, error, onClearError }: RegisterPageProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!username || !email || !password) return

    if (password !== confirmPassword) {
      setLocalError(t('auth.password_mismatch'))
      return
    }

    if (password.length < 6) {
      setLocalError(t('auth.password_too_short'))
      return
    }

    setIsLoading(true)
    try {
      await onRegister(username, nickname, email, password)
    } finally {
      setIsLoading(false)
    }
  }

  const displayError = localError || error

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo and Title */}
        <div className="text-center">
          <img src="/logo.svg" alt="Gist" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gist</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('auth.register_description')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {displayError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {displayError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  setLocalError(null)
                  onClearError()
                }}
              >
                {t('actions.close')}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-foreground">
              {t('auth.username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, ''))}
              placeholder={t('auth.username_placeholder')}
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
            <p className="text-xs text-muted-foreground">{t('auth.username_hint')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="nickname" className="text-sm font-medium text-foreground">
              {t('auth.nickname')}
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('auth.nickname_placeholder')}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={isLoading}
              autoComplete="nickname"
            />
            <p className="text-xs text-muted-foreground">{t('auth.nickname_hint')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email_placeholder')}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={isLoading}
              autoComplete="email"
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
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">{t('auth.password_hint')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              {t('auth.confirm_password')}
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.confirm_password_placeholder')}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !username || !email || !password || !confirmPassword}
            className={cn(
              'inline-flex h-10 w-full items-center justify-center rounded-md',
              'bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            {isLoading ? t('auth.registering') : t('auth.register')}
          </button>
        </form>
      </div>
    </div>
  )
}
