import type { RefObject } from 'react'
import { useEffect } from 'react'
import hljs from 'highlight.js/lib/common'

export function useCodeHighlight(
  containerRef: RefObject<HTMLElement | null>,
  content: string
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const blocks = container.querySelectorAll('pre code')
    blocks.forEach((block) => {
      if (block instanceof HTMLElement) {
        const pre = block.parentElement
        if (pre instanceof HTMLElement) {
          const match = /language-([a-z0-9-]+)/i.exec(block.className || '')
          if (match) {
            pre.dataset.language = match[1]
          } else {
            delete pre.dataset.language
          }
        }
        if (!block.dataset.highlighted) {
          hljs.highlightElement(block)
        }
      }
    })
  }, [containerRef, content])
}
