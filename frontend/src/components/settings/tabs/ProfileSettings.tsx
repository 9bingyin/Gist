import { useState, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentUser, updateProfile, setAuthToken } from '@/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function ProfileSettings() {
  const { t } = useTranslation()
  const { user, setUser } = useAuthStore()
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoadingNickname, setIsLoadingNickname] = useState(false)
  const [isLoadingEmail, setIsLoadingEmail] = useState(false)
  const [isLoadingPassword, setIsLoadingPassword] = useState(false)
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setNickname(user.nickname)
      setEmail(user.email)
    } else {
      getCurrentUser().then((userData) => {
        setUsername(userData.username)
        setNickname(userData.nickname)
        setEmail(userData.email)
      }).catch(() => {
        // ignore
      })
    }
  }, [user])

  const handleSaveNickname = async () => {
    setIsLoadingNickname(true)
    setNicknameStatus('idle')
    setError(null)
    try {
      const result = await updateProfile({ nickname })
      setUser(result.user)
      setNicknameStatus('success')
      setTimeout(() => setNicknameStatus('idle'), 2000)
    } catch (err) {
      setNicknameStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to update nickname')
    } finally {
      setIsLoadingNickname(false)
    }
  }

  const handleSaveEmail = async () => {
    setIsLoadingEmail(true)
    setEmailStatus('idle')
    setError(null)
    try {
      const result = await updateProfile({ email })
      setUser(result.user)
      setEmailStatus('success')
      setTimeout(() => setEmailStatus('idle'), 2000)
    } catch (err) {
      setEmailStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setIsLoadingEmail(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError(t('auth.password_mismatch'))
      return
    }

    if (newPassword.length < 6) {
      setError(t('auth.password_too_short'))
      return
    }

    setIsLoadingPassword(true)
    setPasswordStatus('idle')
    try {
      const result = await updateProfile({ currentPassword, newPassword })
      // Update token if password was changed (old tokens are invalidated)
      if (result.token) {
        setAuthToken(result.token)
      }
      setPasswordStatus('success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordStatus('idle'), 2000)
    } catch (err) {
      setPasswordStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsLoadingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            {t('actions.close')}
          </button>
        </div>
      )}

      {/* Username Section (Read-only) */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{t('profile.username')}</div>
            <div className="text-xs text-muted-foreground">{t('profile.username_readonly')}</div>
          </div>
          <input
            type="text"
            value={username}
            disabled
            className={cn(
              'h-8 w-48 rounded-md border border-border bg-muted px-2 text-sm',
              'text-muted-foreground cursor-not-allowed'
            )}
          />
        </div>
      </section>

      {/* Nickname Section */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{t('profile.nickname')}</div>
            <div className="text-xs text-muted-foreground">{t('profile.nickname_hint')}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={cn(
                'h-8 w-48 rounded-md border border-border bg-background px-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
            />
            <button
              type="button"
              onClick={handleSaveNickname}
              disabled={isLoadingNickname || !nickname}
              className={cn(
                'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                nicknameStatus === 'success' && 'bg-green-600 hover:bg-green-600',
                nicknameStatus === 'error' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isLoadingNickname ? t('profile.saving') : nicknameStatus === 'success' ? t('profile.saved') : t('profile.save_nickname')}
            </button>
          </div>
        </div>
      </section>

      {/* Email Section */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm font-medium">{t('profile.email')}</div>
          <div className="flex shrink-0 gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                'h-8 w-48 rounded-md border border-border bg-background px-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
            />
            <button
              type="button"
              onClick={handleSaveEmail}
              disabled={isLoadingEmail || !email}
              className={cn(
                'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                emailStatus === 'success' && 'bg-green-600 hover:bg-green-600',
                emailStatus === 'error' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isLoadingEmail ? t('profile.saving') : emailStatus === 'success' ? t('profile.saved') : t('profile.save_email')}
            </button>
          </div>
        </div>
      </section>

      {/* Change Password Section */}
      <section>
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('profile.change_password')}
        </div>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium">{t('profile.current_password')}</div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={cn(
                'h-8 w-48 rounded-md border border-border bg-background px-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
              autoComplete="current-password"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium">{t('profile.new_password')}</div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={cn(
                'h-8 w-48 rounded-md border border-border bg-background px-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium">{t('profile.confirm_new_password')}</div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn(
                'h-8 w-48 rounded-md border border-border bg-background px-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoadingPassword || !currentPassword || !newPassword || !confirmPassword}
              className={cn(
                'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                passwordStatus === 'success' && 'bg-green-600 hover:bg-green-600',
                passwordStatus === 'error' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isLoadingPassword ? t('profile.saving') : passwordStatus === 'success' ? t('profile.password_changed') : t('profile.save_password')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
