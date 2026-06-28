import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EntryContentBody } from './EntryContentBody'
import type { Entry } from '@/types/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/useCodeHighlight', () => ({
  useCodeHighlight: vi.fn(),
}))

vi.mock('@/hooks/useEntryMeta', () => ({
  useEntryMeta: () => ({
    publishedLong: null,
    readingTime: null,
  }),
}))

vi.mock('@/components/ui/article-content', () => ({
  ArticleContent: ({ content }: { content?: string }) => <div>{content}</div>,
}))

const entry: Entry = {
  id: 'entry-1',
  feedId: 'feed-1',
  title: '重复下载:\nhttps://haloshell.halocloudnet.com/download',
  url: 'https://haloshell.halocloudnet.com/download',
  content: '<p>修复了部分错误</p>',
  read: false,
  starred: false,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
}

describe('EntryContentBody', () => {
  it('allows long URL titles to wrap instead of clipping horizontally', () => {
    render(
      <EntryContentBody
        entry={entry}
        scrollRef={vi.fn()}
        displayContent={entry.content}
      />
    )

    const titleLink = screen.getByRole('link', { name: /haloshell/ })
    const title = titleLink.closest('h1')

    expect(title?.className).toContain('wrap-anywhere')
    expect(titleLink.className).not.toContain('wrap-anywhere')
  })
})
