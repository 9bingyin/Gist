import type { RefObject } from 'react'
import { useEffect } from 'react'
import type { HighlighterGeneric, BundledLanguage, BundledTheme } from 'shiki'
import { createHighlighter } from 'shiki'

let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null
const loadedLanguages = new Set<string>()

const commonLanguages = [
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'python',
  'bash',
  'shell',
  'markdown',
  'yaml',
  'xml',
  'sql',
] as const

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...commonLanguages],
    })
    for (const lang of commonLanguages) {
      loadedLanguages.add(lang)
    }
  }
  return highlighterPromise
}

function normalizeLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    htm: 'html',
    plaintext: 'text',
    text: 'text',
  }
  return aliases[lang.toLowerCase()] || lang.toLowerCase()
}

function createCopyButton(code: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'code-copy-btn'
  button.type = 'button'
  button.setAttribute('aria-label', 'Copy code')
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code)
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      button.classList.add('copied')
      setTimeout(() => {
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
        button.classList.remove('copied')
      }, 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  })

  return button
}

export function useCodeHighlight(
  containerRef: RefObject<HTMLElement | null>,
  content: string
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const blocks = container.querySelectorAll('pre code')
    if (blocks.length === 0) return

    let cancelled = false

    async function highlightBlocks() {
      const highlighter = await getHighlighter()
      if (cancelled) return

      for (const block of blocks) {
        if (cancelled) break
        if (!(block instanceof HTMLElement)) continue

        const pre = block.parentElement
        if (!(pre instanceof HTMLElement)) continue

        if (pre.dataset.shikiHighlighted) continue

        const match = /language-([a-z0-9_+-]+)/i.exec(block.className || '')
        const rawLang = match ? match[1] : ''
        const lang = normalizeLanguage(rawLang)

        const code = block.textContent || ''
        if (!code.trim()) continue

        let effectiveLang = lang
        if (lang && lang !== 'text') {
          if (!loadedLanguages.has(lang)) {
            try {
              await highlighter.loadLanguage(lang as BundledLanguage)
              loadedLanguages.add(lang)
            } catch {
              effectiveLang = 'text'
            }
          }
        } else {
          effectiveLang = 'text'
        }

        if (cancelled) break

        try {
          const html = highlighter.codeToHtml(code, {
            lang: effectiveLang,
            themes: {
              light: 'github-light',
              dark: 'github-dark',
            },
            defaultColor: false,
          })

          const temp = document.createElement('div')
          temp.innerHTML = html
          const newPre = temp.querySelector('pre')
          if (newPre) {
            const newCode = newPre.querySelector('code')
            if (newCode) {
              block.innerHTML = newCode.innerHTML
              block.className = newCode.className
            }
            pre.className = `${pre.className} ${newPre.className}`.trim()

            // Set data-language attribute for CSS targeting (rehype-pretty-code compatible)
            if (rawLang) {
              pre.dataset.language = rawLang
            }

            // Add header with language label and copy button
            if (!pre.querySelector('.code-header')) {
              const header = document.createElement('div')
              header.className = 'code-header'

              if (rawLang) {
                const langSpan = document.createElement('span')
                langSpan.className = 'code-lang'
                langSpan.textContent = rawLang
                header.appendChild(langSpan)
              }

              const copyBtn = createCopyButton(code)
              header.appendChild(copyBtn)

              pre.insertBefore(header, pre.firstChild)
            }

            pre.dataset.shikiHighlighted = 'true'
          }
        } catch {
          pre.dataset.shikiHighlighted = 'true'
        }
      }
    }

    highlightBlocks()

    return () => {
      cancelled = true
    }
  }, [containerRef, content])
}
