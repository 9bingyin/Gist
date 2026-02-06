import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Entry } from '@/types/api'
import { useAITranslation } from './useAITranslation'

const {
  mockStreamTranslateBlocks,
  mockNeedsTranslation,
  mockTranslateArticlesBatch,
  mockStoreGetTranslation,
  mockTranslationActionsSet,
  mockTranslationActionsDisable,
  mockTranslationActionsEnable,
  mockTranslationActionsIsDisabled,
} = vi.hoisted(() => ({
  mockStreamTranslateBlocks: vi.fn(),
  mockNeedsTranslation: vi.fn(),
  mockTranslateArticlesBatch: vi.fn(() => Promise.resolve()),
  mockStoreGetTranslation: vi.fn(),
  mockTranslationActionsSet: vi.fn(),
  mockTranslationActionsDisable: vi.fn(),
  mockTranslationActionsEnable: vi.fn(),
  mockTranslationActionsIsDisabled: vi.fn(() => false),
}))

vi.mock('@/api', () => ({
  streamTranslateBlocks: mockStreamTranslateBlocks,
  isTranslateInit: (event: unknown) =>
    typeof event === 'object' && event !== null && 'blocks' in event,
  isTranslateBlockResult: (event: unknown) =>
    typeof event === 'object' &&
    event !== null &&
    'index' in event &&
    'html' in event &&
    !('blocks' in event),
  isTranslateDone: (event: unknown) =>
    typeof event === 'object' && event !== null && 'done' in event,
  isTranslateError: (event: unknown) =>
    typeof event === 'object' && event !== null && 'error' in event,
}))

vi.mock('@/lib/language-detect', () => ({
  needsTranslation: mockNeedsTranslation,
}))

vi.mock('@/lib/html-utils', () => ({
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
}))

vi.mock('@/services/translation-service', () => ({
  translateArticlesBatch: mockTranslateArticlesBatch,
}))

vi.mock('@/stores/translation-store', () => ({
  useTranslationStore: (selector: (state: { getTranslation: typeof mockStoreGetTranslation }) => unknown) =>
    selector({
      getTranslation: mockStoreGetTranslation,
    }),
  translationActions: {
    set: mockTranslationActionsSet,
    disable: mockTranslationActionsDisable,
    enable: mockTranslationActionsEnable,
    isDisabled: mockTranslationActionsIsDisabled,
  },
}))

function createEntry(content: string): Entry {
  return {
    id: 'entry-1',
    feedId: 'feed-1',
    title: 'Test title',
    content,
    read: false,
    starred: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

function createAbortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function createAbortAwarePendingStream(signal?: AbortSignal): AsyncGenerator<unknown> {
  return (async function* () {
    await new Promise<never>((_, reject) => {
      if (signal?.aborted) {
        reject(createAbortError())
        return
      }
      signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
    })
    // Unreachable in normal flow; keeps generator shape explicit for lint rule.
    yield { done: true }
  })()
}

function createDeferredCachedStream(content: string): {
  stream: AsyncGenerator<unknown>
  resolve: () => void
} {
  let resolveGate: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve
  })

  const stream = (async function* () {
    await gate
    yield { cached: true, content }
  })()

  return {
    stream,
    resolve: () => {
      resolveGate?.()
    },
  }
}

describe('useAITranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreGetTranslation.mockReturnValue(undefined)
    mockNeedsTranslation.mockReturnValue(true)
    mockTranslationActionsIsDisabled.mockReturnValue(false)
  })

  it('切换到 Readability 且无需翻译时会中断当前翻译并停止 loading', async () => {
    mockNeedsTranslation.mockImplementation((_title: string, summary: string | null) => {
      return !(summary ?? '').includes('already-target')
    })
    mockStreamTranslateBlocks.mockImplementation((_req, signal) => createAbortAwarePendingStream(signal))

    const entry = createEntry('foreign normal content to translate')
    const { result, rerender } = renderHook(
      (props: { isReadableActive: boolean }) =>
        useAITranslation({
          entry,
          isReadableActive: props.isReadableActive,
          readableContent: 'already-target readability content',
          autoTranslate: true,
          targetLanguage: 'zh-CN',
        }),
      { initialProps: { isReadableActive: false } }
    )

    await waitFor(() => {
      expect(result.current.isTranslating).toBe(true)
    })
    expect(mockStreamTranslateBlocks).toHaveBeenCalledTimes(1)

    rerender({ isReadableActive: true })

    await waitFor(() => {
      expect(result.current.isTranslating).toBe(false)
    })
    expect(mockStreamTranslateBlocks).toHaveBeenCalledTimes(1)
    expect(result.current.translatedContent).toBeNull()
  })

  it('旧请求晚到的缓存结果不会覆盖当前模式翻译状态', async () => {
    const staleStream = createDeferredCachedStream('stale-normal-content')
    let callCount = 0

    mockNeedsTranslation.mockReturnValue(true)
    mockStreamTranslateBlocks.mockImplementation((_req, signal) => {
      callCount += 1
      if (callCount === 1) {
        return staleStream.stream
      }
      return createAbortAwarePendingStream(signal)
    })

    const entry = createEntry('foreign normal content')
    const { result, rerender } = renderHook(
      (props: { isReadableActive: boolean }) =>
        useAITranslation({
          entry,
          isReadableActive: props.isReadableActive,
          readableContent: 'foreign readability content',
          autoTranslate: true,
          targetLanguage: 'zh-CN',
        }),
      { initialProps: { isReadableActive: false } }
    )

    await waitFor(() => {
      expect(result.current.isTranslating).toBe(true)
    })

    rerender({ isReadableActive: true })

    await waitFor(() => {
      expect(mockStreamTranslateBlocks).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      staleStream.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.translatedContent).toBeNull()
    expect(result.current.isTranslating).toBe(true)
  })

  it('切回原始内容后会重新触发自动翻译', async () => {
    mockNeedsTranslation.mockImplementation((_title: string, summary: string | null) => {
      return !(summary ?? '').includes('already-target')
    })

    let callCount = 0
    mockStreamTranslateBlocks.mockImplementation((_req, signal) => {
      callCount += 1
      if (callCount === 1) {
        return createAbortAwarePendingStream(signal)
      }
      return (async function* () {
        yield { done: true }
      })()
    })

    const entry = createEntry('foreign normal content')
    const { result, rerender } = renderHook(
      (props: { isReadableActive: boolean }) =>
        useAITranslation({
          entry,
          isReadableActive: props.isReadableActive,
          readableContent: 'already-target readability content',
          autoTranslate: true,
          targetLanguage: 'zh-CN',
        }),
      { initialProps: { isReadableActive: false } }
    )

    await waitFor(() => {
      expect(mockStreamTranslateBlocks).toHaveBeenCalledTimes(1)
      expect(result.current.isTranslating).toBe(true)
    })

    rerender({ isReadableActive: true })

    await waitFor(() => {
      expect(result.current.isTranslating).toBe(false)
    })

    rerender({ isReadableActive: false })

    await waitFor(() => {
      expect(mockStreamTranslateBlocks).toHaveBeenCalledTimes(2)
    })
  })
})
