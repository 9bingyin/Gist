import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFeeds } from '@/hooks/useFeeds'
import type { Entry } from '@/types/api'

export function useEntryMeta(entry: Entry | null | undefined) {
  const { data: feeds } = useFeeds()
  const { t, i18n } = useTranslation()

  const longDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [i18n.language]
  )

  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [i18n.language]
  )

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
  }, [publishedAt, longDateFormatter])

  const publishedShort = useMemo(() => {
    if (!publishedAt) return null
    return shortDateFormatter.format(publishedAt)
  }, [publishedAt, shortDateFormatter])

  const readingTime = useMemo(() => {
    if (!entry?.content) return null
    const text = entry.content.replace(/<[^>]*>/g, '')
    const words = text.match(/[\u4e00-\u9fa5]|\w+/g)?.length || 0
    const mins = Math.ceil(words / 230) // Adjusted for mixed content
    return mins > 0 ? t('entry.min_read', { mins }) : null
  }, [entry, t])

  return { feedTitle, publishedLong, publishedShort, readingTime }
}
