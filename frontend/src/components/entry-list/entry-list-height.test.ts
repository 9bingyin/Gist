import { describe, expect, it, vi } from 'vitest'
import { estimateEntryListItemHeight } from './entry-list-height'
import type { Entry } from '@/types/api'

vi.mock('@chenglou/pretext', () => ({
  prepare: (text: string, font: string) => ({ text, font }),
  layout: (
    prepared: { text: string },
    width: number,
    lineHeight: number,
  ) => {
    const normalizedWidth = Math.max(width, 1)
    const charsPerLine = Math.max(Math.floor(normalizedWidth / 8), 1)
    const lineCount = Math.max(Math.ceil(prepared.text.length / charsPerLine), 1)
    return { height: lineCount * lineHeight, lineCount }
  },
}))

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    feedId: 'feed-1',
    title: 'Short title',
    content: '<p>Short summary</p>',
    read: false,
    starred: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('estimateEntryListItemHeight', () => {
  it('在容器宽度不足时回退到默认高度', () => {
    const height = estimateEntryListItemHeight(makeEntry(), 0)
    expect(height).toBe(100)
  })

  it('长文本在窄容器下会得到更高的估算值', () => {
    const entry = makeEntry({
      title: 'A medium length title that wraps on narrow lists',
      content:
        '<p>A summary long enough to wrap in a narrow list but remain shorter in a wide list.</p>',
    })

    const narrowHeight = estimateEntryListItemHeight(entry, 220)
    const wideHeight = estimateEntryListItemHeight(entry, 480)

    expect(narrowHeight).toBeGreaterThan(wideHeight)
  })

  it('没有摘要时只计算标题区域高度', () => {
    const withoutSummary = estimateEntryListItemHeight(
      makeEntry({ content: '' }),
      320,
    )

    const withSummary = estimateEntryListItemHeight(
      makeEntry({ content: '<p>Summary</p>' }),
      320,
    )

    expect(withSummary).toBeGreaterThan(withoutSummary)
  })
})
