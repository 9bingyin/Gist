import { useMemo } from 'react'
import { useFeeds } from '@/hooks/useFeeds'
import type { Entry } from '@/types/api'

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function useEntryMeta(entry: Entry | null | undefined) {
  const { data: feeds } = useFeeds()

  const feedTitle = useMemo(() => {
    if (!entry?.feedId || !feeds) return null
    return feeds.find((feed) => feed.id === entry.feedId)?.title ?? null
  }, [entry, feeds])

  const publishedAt = useMemo(() => {
    if (!entry?.publishedAt) return null
    const date = new Date(entry.publishedAt)
    if (Number.isNaN(date.getTime())) return null
    return date
  }, [entry])

  const publishedLong = useMemo(() => {
    if (!publishedAt) return null
    return longDateFormatter.format(publishedAt)
  }, [publishedAt])

  const publishedShort = useMemo(() => {
    if (!publishedAt) return null
    return shortDateFormatter.format(publishedAt)
  }, [publishedAt])

  const readingTime = useMemo(() => {
    if (!entry?.content) return null
    const text = entry.content.replace(/<[^>]*>/g, '')
    const words = text.match(/[\u4e00-\u9fa5]|\w+/g)?.length || 0
    const mins = Math.ceil(words / 230) // Adjusted for mixed content
    return mins > 0 ? `${mins} min read` : null
  }, [entry])

  return { feedTitle, publishedLong, publishedShort, readingTime }
}
