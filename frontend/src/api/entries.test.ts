import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateManyEntryReadStatus } from '@/api'

describe('entries api', () => {
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
  })

  it('批量更新阅读状态时调用兼容批量端点', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }))

    await updateManyEntryReadStatus(['1', '2'], true)

    expect(fetchMock).toHaveBeenCalledWith('/api/entries/read', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ids: ['1', '2'], read: true }),
    }))
  })
})
