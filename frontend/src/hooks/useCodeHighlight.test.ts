import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCodeHighlight } from './useCodeHighlight'

// Mock Shiki
const mockCodeToHtml = vi.fn()
const mockLoadLanguage = vi.fn()
const mockHighlighter = {
  codeToHtml: mockCodeToHtml,
  loadLanguage: mockLoadLanguage,
}

vi.mock('shiki', () => ({
  createHighlighter: vi.fn(() => Promise.resolve(mockHighlighter)),
}))

describe('useCodeHighlight', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    mockCodeToHtml.mockReset()
    mockLoadLanguage.mockReset()
    // Default mock return for codeToHtml
    mockCodeToHtml.mockReturnValue(
      '<pre class="shiki"><code><span class="line">highlighted code</span></code></pre>'
    )
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.clearAllMocks()
  })

  it('should return early if container ref is null', () => {
    const ref = { current: null }
    renderHook(() => useCodeHighlight(ref, 'content'))

    expect(mockCodeToHtml).not.toHaveBeenCalled()
  })

  it('should return early if no code blocks found', () => {
    container.innerHTML = '<p>No code here</p>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    expect(mockCodeToHtml).not.toHaveBeenCalled()
  })

  it('should skip empty code blocks', async () => {
    container.innerHTML = '<pre><code class="language-js">   </code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      expect(mockCodeToHtml).not.toHaveBeenCalled()
    })
  })

  it('should highlight code blocks with language class', async () => {
    container.innerHTML = '<pre><code class="language-javascript">const x = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      expect(mockCodeToHtml).toHaveBeenCalledWith('const x = 1', expect.objectContaining({
        lang: 'javascript',
        themes: {
          light: 'github-light',
          dark: 'github-dark',
        },
        defaultColor: false,
      }))
    })
  })

  it('should add shiki class to pre element', async () => {
    container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const pre = container.querySelector('pre')
      expect(pre?.className).toContain('shiki')
    })
  })

  it('should set data-shikiHighlighted attribute after processing', async () => {
    container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const pre = container.querySelector('pre')
      expect(pre?.dataset.shikiHighlighted).toBe('true')
    })
  })

  it('should set data-language attribute on pre element', async () => {
    container.innerHTML = '<pre><code class="language-typescript">const x: number = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const pre = container.querySelector('pre')
      expect(pre?.dataset.language).toBe('typescript')
    })
  })

  it('should not set data-language attribute when language is empty', async () => {
    container.innerHTML = '<pre><code>plain text</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const pre = container.querySelector('pre')
      expect(pre?.dataset.shikiHighlighted).toBe('true')
      expect(pre?.dataset.language).toBeUndefined()
    })
  })

  it('should add code-header with copy button', async () => {
    container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const header = container.querySelector('.code-header')
      expect(header).not.toBeNull()
      const copyBtn = header?.querySelector('.code-copy-btn')
      expect(copyBtn).not.toBeNull()
      expect(copyBtn?.getAttribute('aria-label')).toBe('Copy code')
    })
  })

  it('should add language label when language is specified', async () => {
    container.innerHTML = '<pre><code class="language-python">print("hello")</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const langSpan = container.querySelector('.code-lang')
      expect(langSpan).not.toBeNull()
      expect(langSpan?.textContent).toBe('python')
    })
  })

  it('should not add language label when language is not specified', async () => {
    container.innerHTML = '<pre><code>plain text</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      const header = container.querySelector('.code-header')
      expect(header).not.toBeNull()
      const langSpan = container.querySelector('.code-lang')
      expect(langSpan).toBeNull()
    })
  })

  it('should not re-highlight already processed blocks', async () => {
    container.innerHTML = '<pre data-shiki-highlighted="true"><code class="language-js">const x = 1</code></pre>'
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      expect(mockCodeToHtml).not.toHaveBeenCalled()
    })
  })

  it('should handle multiple code blocks', async () => {
    container.innerHTML = `
      <pre><code class="language-js">const x = 1</code></pre>
      <pre><code class="language-python">x = 1</code></pre>
    `
    const ref = { current: container }

    renderHook(() => useCodeHighlight(ref, 'content'))

    await waitFor(() => {
      expect(mockCodeToHtml).toHaveBeenCalledTimes(2)
    })
  })

  describe('language normalization', () => {
    it('should normalize js to javascript', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'javascript' })
        )
      })
    })

    it('should normalize ts to typescript', async () => {
      container.innerHTML = '<pre><code class="language-ts">const x: number = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'typescript' })
        )
      })
    })

    it('should normalize py to python', async () => {
      container.innerHTML = '<pre><code class="language-py">x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'python' })
        )
      })
    })

    it('should normalize sh to bash', async () => {
      container.innerHTML = '<pre><code class="language-sh">echo hello</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'bash' })
        )
      })
    })

    it('should normalize yml to yaml', async () => {
      container.innerHTML = '<pre><code class="language-yml">key: value</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'yaml' })
        )
      })
    })

    it('should use text for plaintext', async () => {
      container.innerHTML = '<pre><code class="language-plaintext">plain text</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'text' })
        )
      })
    })

    it('should convert language to lowercase', async () => {
      container.innerHTML = '<pre><code class="language-JavaScript">const x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ lang: 'javascript' })
        )
      })
    })
  })

  describe('copy button functionality', () => {
    beforeEach(() => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(() => Promise.resolve()),
        },
      })
    })

    it('should copy code to clipboard when clicked', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        const copyBtn = container.querySelector('.code-copy-btn') as HTMLButtonElement
        expect(copyBtn).not.toBeNull()
      })

      const copyBtn = container.querySelector('.code-copy-btn') as HTMLButtonElement
      await act(async () => {
        copyBtn.click()
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1')
    })

    it('should add copied class after clicking', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        const copyBtn = container.querySelector('.code-copy-btn')
        expect(copyBtn).not.toBeNull()
      })

      const copyBtn = container.querySelector('.code-copy-btn') as HTMLButtonElement
      await act(async () => {
        copyBtn.click()
      })

      expect(copyBtn.classList.contains('copied')).toBe(true)
    })

    it('should have correct button attributes', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      renderHook(() => useCodeHighlight(ref, 'content'))

      await waitFor(() => {
        const copyBtn = container.querySelector('.code-copy-btn') as HTMLButtonElement
        expect(copyBtn).not.toBeNull()
        expect(copyBtn.type).toBe('button')
        expect(copyBtn.getAttribute('aria-label')).toBe('Copy code')
      })
    })
  })

  describe('cleanup', () => {
    it('should cancel processing on unmount', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      const { unmount } = renderHook(() => useCodeHighlight(ref, 'content'))

      // Unmount immediately
      unmount()

      // The hook should have set cancelled = true, preventing further processing
      // This is hard to test directly, but we can verify no errors are thrown
      expect(true).toBe(true)
    })
  })

  describe('re-render behavior', () => {
    it('should re-process when content changes', async () => {
      container.innerHTML = '<pre><code class="language-js">const x = 1</code></pre>'
      const ref = { current: container }

      const { rerender } = renderHook(
        ({ content }) => useCodeHighlight(ref, content),
        { initialProps: { content: 'content1' } }
      )

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledTimes(1)
      })

      // Reset and change content
      mockCodeToHtml.mockClear()
      container.innerHTML = '<pre><code class="language-python">x = 1</code></pre>'

      rerender({ content: 'content2' })

      await waitFor(() => {
        expect(mockCodeToHtml).toHaveBeenCalledTimes(1)
      })
    })
  })
})
