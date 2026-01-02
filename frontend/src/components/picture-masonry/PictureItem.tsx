import { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getEntryImages } from '@/lib/extract-images'
import { useLightboxStore } from '@/stores/lightbox-store'
import type { Entry, Feed } from '@/types/api'

interface PictureItemProps {
  entry: Entry
  feed?: Feed
  itemWidth: number
  'data-grid-groupkey'?: number
}

const FOOTER_HEIGHT = 40

export const PictureItem = memo(function PictureItem({
  entry,
  feed,
  itemWidth,
  ...gridProps
}: PictureItemProps) {
  const { t } = useTranslation()
  const openLightbox = useLightboxStore((state) => state.open)
  // Default to 4:3 aspect ratio before image loads
  const [imageRatio, setImageRatio] = useState<number>(4 / 3)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [iconError, setIconError] = useState(false)

  const thumbnailUrl = entry.thumbnailUrl
  const showIcon = feed?.iconPath && !iconError

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setImageRatio(img.naturalWidth / img.naturalHeight)
    }
    setImageLoaded(true)
  }, [])

  const handleClick = useCallback(() => {
    const images = getEntryImages(entry.thumbnailUrl, entry.content)
    if (images.length > 0) {
      openLightbox(entry, feed, images, 0)
    }
  }, [entry, feed, openLightbox])

  const publishedAt = entry.publishedAt ? formatRelativeTime(entry.publishedAt, t) : null

  // Calculate image height based on ratio
  const imageHeight = itemWidth / imageRatio

  if (!thumbnailUrl || imageError) {
    return null
  }

  return (
    <div
      {...gridProps}
      className="cursor-pointer overflow-hidden bg-card shadow-sm transition-shadow hover:shadow-md"
      style={{ width: itemWidth }}
      onClick={handleClick}
    >
      {/* Image container */}
      <div
        className="relative overflow-hidden bg-muted"
        style={{ height: imageHeight }}
      >
        <img
          src={thumbnailUrl}
          alt={entry.title || ''}
          className={cn(
            'w-full object-cover transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={handleImageLoad}
          onError={() => setImageError(true)}
        />
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"
        style={{ height: FOOTER_HEIGHT }}
      >
        {showIcon ? (
          <img
            src={`/icons/${feed.iconPath}`}
            alt=""
            className="size-4 shrink-0 rounded object-contain"
            onError={() => setIconError(true)}
          />
        ) : (
          <FeedIcon className="size-4 shrink-0 text-muted-foreground/50" />
        )}
        <span className="truncate">{feed?.title || 'Unknown'}</span>
        {publishedAt && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="shrink-0">{publishedAt}</span>
          </>
        )}
      </div>
    </div>
  )
})

function FeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
    </svg>
  )
}

function formatRelativeTime(dateString: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return t('add_feed.just_now')
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return t('add_feed.minutes_ago', { count: minutes })
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return t('add_feed.hours_ago', { count: hours })
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return t('add_feed.days_ago', { count: days })
  }

  return date.toLocaleDateString()
}
