import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export function useAuth() {
  const { state, user, error, initialize, login, register, logout, retry, clearError } = useAuthStore()

  useEffect(() => {
    if (state === 'loading') {
      initialize()
    }
  }, [state, initialize])

  // Re-initialize when the app comes back to the foreground (iOS PWA background resume
  // or BFCache restoration). If the page was suspended while initialize() was in-flight,
  // the pending promises may never resolve, leaving state stuck at 'loading'. Retrying
  // here ensures the auth flow completes once the page is visible again.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && useAuthStore.getState().state === 'loading') {
        useAuthStore.getState().initialize()
      }
    }
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && useAuthStore.getState().state === 'loading') {
        useAuthStore.getState().initialize()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return {
    // State
    isLoading: state === 'loading',
    isAuthenticated: state === 'authenticated',
    needsRegistration: state === 'no-user',
    needsLogin: state === 'unauthenticated',
    isNetworkError: state === 'network-error',
    user,
    error,

    // Actions
    login,
    register,
    logout,
    retry,
    clearError,
  }
}
