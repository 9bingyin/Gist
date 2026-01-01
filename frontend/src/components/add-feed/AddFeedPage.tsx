import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAddFeed } from '@/hooks/useAddFeed'
import { useFolders } from '@/hooks/useFolders'
import { FeedUrlForm } from './FeedUrlForm'
import { FeedPreviewCard } from './FeedPreviewCard'
import type { ContentType } from '@/types/api'

interface AddFeedPageProps {
  onClose: () => void
  onFeedAdded?: (feedUrl: string) => void
  contentType?: ContentType
}

export type { FeedPreview } from '@/types/api'
export type { SubscribeOptions } from '@/hooks/useAddFeed'

export function AddFeedPage({ onClose, onFeedAdded, contentType = 'article' }: AddFeedPageProps) {
  const { t } = useTranslation()
  const {
    feedPreview,
    isLoading,
    error,
    discoverFeed,
    subscribeFeed,
  } = useAddFeed(contentType)
  const { data: folders = [] } = useFolders()

  const handleSubscribe = useCallback(async (feedUrl: string, options: { folderName?: string; title?: string }) => {
    const success = await subscribeFeed(feedUrl, options)
    if (success) {
      onFeedAdded?.(feedUrl)
      onClose()
    }
  }, [subscribeFeed, onFeedAdded, onClose])

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Back button - top left */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute left-4 top-4 z-10',
          'inline-flex items-center gap-1.5',
          'rounded-lg px-3 py-1.5',
          'text-sm text-muted-foreground',
          'hover:bg-accent/50 hover:text-foreground',
          'transition-colors duration-200'
        )}
      >
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span>{t('add_feed.back')}</span>
      </button>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          {/* Hero Section */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <svg className="size-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">{t('add_feed.add_rss_feed')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('add_feed.feed_description')}
            </p>
          </div>

          {/* URL Form */}
          <FeedUrlForm
            onSubmit={discoverFeed}
            isLoading={isLoading}
          />

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Feed Preview */}
          {feedPreview && (
            <div className="mt-6">
              <FeedPreviewCard
                feed={feedPreview}
                folders={folders}
                onSubscribe={handleSubscribe}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
