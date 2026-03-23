import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCodeHighlight } from './useCodeHighlight'

const mockHighlightCode = vi.fn()

vi.mock('@/lib/code-highlight-runtime', () => ({
  highlightCode: mockHighlightCode,
}))

describe('useCodeHighlight', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    mockHighlightCode.mockReset()
    mockHighlightCode.mockResolvedValue(
      '<pre class="shiki"><code><span class="line">highlighted code</span></code></pre>'
    )
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.clearAllMocks()
  })

  it('容器为空时不会加载高亮运行时', () => {
    renderHook(() => useCodeHighlight({ current: null }, 'content'))
    expect(mockHighlightCode).not.toHaveBeenCalled()
  })

  it('没有代码块时不会触发高亮', () => {
    container.innerHTML = '<p>No code here</p>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    expect(mockHighlightCode).not.toHaveBeenCalled()
  })

  it('会按规范化后的语言调用高亮运行时', async () => {
    container.innerHTML = '<pre><code class="language-ts">const x: number = 1</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      expect(mockHighlightCode).toHaveBeenCalledWith('const x: number = 1', 'typescript')
    })
  })

  it('会给 pre 节点写入高亮状态和语言标记', async () => {
    container.innerHTML = '<pre><code class="language-javascript">const x = 1</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      const pre = container.querySelector('pre')
      expect(pre?.className).toContain('shiki')
      expect(pre?.dataset.shikiHighlighted).toBe('true')
      expect(pre?.dataset.language).toBe('javascript')
    })
  })

  it('没有语言时会退回 text', async () => {
    container.innerHTML = '<pre><code>plain text</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      expect(mockHighlightCode).toHaveBeenCalledWith('plain text', 'text')
    })
  })

  it('会插入语言标签和复制按钮', async () => {
    container.innerHTML = '<pre><code class="language-python">print("hello")</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      const header = container.querySelector('[data-code-header="true"]')
      expect(header).not.toBeNull()
      expect(header?.querySelector('span.font-mono.uppercase')?.textContent).toBe('python')
      expect(header?.querySelector('button[aria-label="Copy code"]')).not.toBeNull()
    })
  })

  it('已经高亮过的代码块不会重复处理', async () => {
    container.innerHTML = '<pre data-shiki-highlighted="true"><code class="language-js">const x = 1</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      expect(mockHighlightCode).not.toHaveBeenCalled()
    })
  })

  it('支持多个代码块', async () => {
    container.innerHTML = `
      <pre><code class="language-js">const x = 1</code></pre>
      <pre><code class="language-python">x = 1</code></pre>
    `

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      expect(mockHighlightCode).toHaveBeenCalledTimes(2)
    })
  })

  it('复制按钮会写入剪贴板并更新状态', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    })

    container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'

    renderHook(() => useCodeHighlight({ current: container }, 'content'))

    await waitFor(() => {
      expect(container.querySelector('button[aria-label="Copy code"]')).not.toBeNull()
    })

    const copyButton = container.querySelector('button[aria-label="Copy code"]') as HTMLButtonElement

    await act(async () => {
      copyButton.click()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1')
    expect(copyButton.classList.contains('!text-green-500')).toBe(true)
  })

  it('内容变化后会重新处理代码块', async () => {
    container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'

    const { rerender } = renderHook(
      ({ content }) => useCodeHighlight({ current: container }, content),
      { initialProps: { content: 'content-1' } }
    )

    await waitFor(() => {
      expect(mockHighlightCode).toHaveBeenCalledTimes(1)
    })

    mockHighlightCode.mockClear()
    container.innerHTML = '<pre><code class="language-python">x = 1</code></pre>'

    rerender({ content: 'content-2' })

    await waitFor(() => {
      expect(mockHighlightCode).toHaveBeenCalledTimes(1)
      expect(mockHighlightCode).toHaveBeenCalledWith('x = 1', 'python')
    })
  })
})
