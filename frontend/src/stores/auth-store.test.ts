import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAuthToken, setAuthToken } from '@/api'
import { useAuthStore } from './auth-store'

describe('auth-store', () => {
  const storage = (() => {
    const data = new Map<string, string>()
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
      removeItem: (key: string) => {
        data.delete(key)
      },
      clear: () => {
        data.clear()
      },
    }
  })()

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('localStorage', storage)
    localStorage.clear()
    useAuthStore.setState({
      state: 'loading',
      user: null,
      error: null,
      shouldRedirectToRoot: false,
    })
  })

  it('401 初始化失败时只清本地会话，不调用 logout 接口', async () => {
    setAuthToken('expired-token')

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ exists: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))

    await useAuthStore.getState().initialize()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/status')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/me')
    expect(getAuthToken()).toBeNull()
    expect(useAuthStore.getState().state).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(true)
  })

  it('handleUnauthorized 会直接清理本地 token 并触发回根路径', () => {
    setAuthToken('expired-token')
    useAuthStore.setState({
      state: 'authenticated',
      user: {
        username: 'alice',
        nickname: 'Alice',
        email: 'alice@example.com',
        avatarUrl: '',
      },
      error: 'stale error',
    })

    useAuthStore.getState().handleUnauthorized()

    expect(getAuthToken()).toBeNull()
    expect(useAuthStore.getState().state).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().error).toBeNull()
    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(true)
  })

  it('consumeRootRedirect 会清除一次性跳转标记', () => {
    useAuthStore.setState({ shouldRedirectToRoot: true })

    useAuthStore.getState().consumeRootRedirect()

    expect(useAuthStore.getState().shouldRedirectToRoot).toBe(false)
  })
})
