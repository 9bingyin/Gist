import { useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import useEmblaCarousel from 'embla-carousel-react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isVideoThumbnail } from '@/lib/media-utils'
import { formatRelativeTime } from '@/lib/date-utils'
import { stripHtml } from '@/lib/html-utils'
import { useLightboxStore } from '@/stores/lightbox-store'
import { FeedIcon } from '@/components/ui/feed-icon'

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

  const handleOverlayClick = useCallback(() => {
    close()
  }, [close])

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
          {/* Top right buttons */}
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            {/* Open original page */}
            {entry?.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {/* Close button */}
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
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
          </div>

          {/* Image carousel */}
          <div className="flex min-h-0 flex-1 items-center justify-center px-12">
            {images.length === 1 ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={images[0]}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
                {/* Video play overlay */}
                {isVideoThumbnail(entry?.thumbnailUrl) && entry?.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center transition-transform hover:scale-110"
                  >
                    <Play className="size-20 fill-white text-white drop-shadow-lg" />
                  </a>
                )}
              </motion.div>
            ) : (
              <div
                ref={emblaRef}
                className="size-full overflow-hidden"
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
                        onClick={(e) => e.stopPropagation()}
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
