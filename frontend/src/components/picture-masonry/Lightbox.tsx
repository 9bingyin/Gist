import { useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import useEmblaCarousel from 'embla-carousel-react'
import { cn } from '@/lib/utils'
import { useLightboxStore } from '@/stores/lightbox-store'

export function Lightbox() {
  const { t } = useTranslation()
  const { isOpen, entry, feed, images, currentIndex, close, setIndex, next, prev } =
    useLightboxStore()

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex: currentIndex,
  })

  const [iconError, setIconError] = useState(false)
  const showIcon = feed?.iconPath && !iconError

  // Sync embla with store
  useEffect(() => {
    if (!emblaApi) return

    const onSelect = () => {
      const index = emblaApi.selectedScrollSnap()
      setIndex(index)
    }

    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi, setIndex])

  // Scroll to index when store changes
  useEffect(() => {
    if (emblaApi && emblaApi.selectedScrollSnap() !== currentIndex) {
      emblaApi.scrollTo(currentIndex)
    }
  }, [emblaApi, currentIndex])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          close()
          break
        case 'ArrowLeft':
          prev()
          break
        case 'ArrowRight':
          next()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close, next, prev])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        close()
      }
    },
    [close]
  )

  const publishedAt = entry?.publishedAt ? formatRelativeTime(entry.publishedAt, t) : null

  // Strip HTML for content preview
  const contentPreview = entry?.content ? stripHtml(entry.content).slice(0, 200) : null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={handleOverlayClick}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            onClick={close}
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Image carousel */}
          <div className="flex min-h-0 flex-1 items-center justify-center px-12">
            {images.length === 1 ? (
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                src={images[0]}
                alt=""
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                ref={emblaRef}
                className="size-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex size-full">
                  {images.map((src, index) => (
                    <div
                      key={src}
                      className="flex min-w-0 flex-[0_0_100%] items-center justify-center px-4"
                    >
                      <img
                        src={src}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        loading={Math.abs(index - currentIndex) <= 1 ? 'eager' : 'lazy'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className={cn(
                    'absolute left-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors',
                    currentIndex === 0 ? 'invisible' : 'hover:bg-white/20'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    prev()
                  }}
                  disabled={currentIndex === 0}
                >
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className={cn(
                    'absolute right-4 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors',
                    currentIndex === images.length - 1 ? 'invisible' : 'hover:bg-white/20'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    next()
                  }}
                  disabled={currentIndex === images.length - 1}
                >
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Bottom info bar */}
          <div
            className="shrink-0 bg-black/50 px-6 py-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-3xl">
              {/* Source and time */}
              <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
                {showIcon ? (
                  <img
                    src={`/icons/${feed.iconPath}`}
                    alt=""
                    className="size-4 shrink-0 rounded object-contain"
                    onError={() => setIconError(true)}
                  />
                ) : (
                  <FeedIcon className="size-4 shrink-0" />
                )}
                <span>{feed?.title || 'Unknown'}</span>
                {publishedAt && (
                  <>
                    <span>·</span>
                    <span>{publishedAt}</span>
                  </>
                )}
                {images.length > 1 && (
                  <>
                    <span>·</span>
                    <span>
                      {currentIndex + 1} / {images.length}
                    </span>
                  </>
                )}
              </div>

              {/* Title */}
              {entry?.title && (
                <h2 className="mb-1 text-lg font-semibold text-white">{entry.title}</h2>
              )}

              {/* Content preview */}
              {contentPreview && (
                <p className="line-clamp-2 text-sm text-white/70">{contentPreview}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
    </svg>
  )
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
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
