import { useEffect, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useEmblaCarousel from 'embla-carousel-react'
import { cn } from '@/lib/utils'
import { useImagePreviewStore } from '@/stores/image-preview-store'

export function ImagePreview() {
  const { isOpen, images, currentIndex, close, reset, setIndex } = useImagePreviewStore()

  // Track pointer position to distinguish click from drag in carousel
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)
  const scrollLockYRef = useRef(0)
  const touchMoveHandlerRef = useRef<((e: TouchEvent) => void) | null>(null)

  // Track if index change is from embla interaction (to avoid scrollTo interrupting animation)
  const isEmblaNavigatingRef = useRef(false)

  // Track previous isOpen state to detect when preview opens
  const wasOpenRef = useRef(isOpen)

  // Capture initial index when preview opens
  // We need to update this when isOpen changes from false to true
  const initialIndexRef = useRef(currentIndex)
  if (isOpen && !wasOpenRef.current) {
    // Preview just opened - capture the current index
    initialIndexRef.current = currentIndex
  }
  wasOpenRef.current = isOpen

  // Memoize options to prevent unnecessary reInit (which would skip animations)
  const emblaOptions = useMemo(
    () => ({
      loop: false,
      startIndex: initialIndexRef.current,
      skipSnaps: false,
      duration: 25,
    }),
    // Recreate options when preview opens (images change) or when initial index changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, isOpen && initialIndexRef.current]
  )

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions)

  // Sync embla with store
  useEffect(() => {
    if (!emblaApi) return

    const onSelect = () => {
      // Mark that this index change is from embla interaction
      isEmblaNavigatingRef.current = true
      const index = emblaApi.selectedScrollSnap()
      setIndex(index)
    }

    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi, setIndex])

  // Scroll to index when store changes (from external source, not embla)
  useEffect(() => {
    // Skip if change is from embla navigation (would interrupt animation)
    if (isEmblaNavigatingRef.current) {
      isEmblaNavigatingRef.current = false
      return
    }
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
          emblaApi?.scrollPrev()
          break
        case 'ArrowRight':
          emblaApi?.scrollNext()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close, emblaApi])

  // Prevent body scroll when open. iOS PWA avoids position: fixed to prevent white bar.
  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isStandalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    // iOS PWA uses touchmove lock to avoid position: fixed viewport bugs.
    const isIOSPWA = isIOS && isStandalone

    const unlockScroll = () => {
      const storedTop = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''

      if (touchMoveHandlerRef.current) {
        document.removeEventListener('touchmove', touchMoveHandlerRef.current)
        touchMoveHandlerRef.current = null
      }

      if (isIOSPWA) {
        if (scrollLockYRef.current) {
          window.scrollTo(0, scrollLockYRef.current)
        }
        return
      }

      if (storedTop) {
        window.scrollTo(0, parseInt(storedTop, 10) * -1)
      }
    }

    if (isOpen) {
      scrollLockYRef.current = window.scrollY

      if (isIOSPWA) {
        document.documentElement.style.overflow = 'hidden'
        document.body.style.overflow = 'hidden'
        const handler = (e: TouchEvent) => {
          e.preventDefault()
        }
        touchMoveHandlerRef.current = handler
        document.addEventListener('touchmove', handler, { passive: false })
      } else {
        document.body.style.position = 'fixed'
        document.body.style.top = `-${scrollLockYRef.current}px`
        document.body.style.left = '0'
        document.body.style.right = '0'
        document.body.style.overflow = 'hidden'
      }
    } else {
      unlockScroll()
    }

    return () => {
      unlockScroll()
    }
  }, [isOpen])

  const handleCarouselPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleCarouselClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if pointer moved less than 5px (pure click, not drag)
      if (pointerDownPos.current) {
        const dx = Math.abs(e.clientX - pointerDownPos.current.x)
        const dy = Math.abs(e.clientY - pointerDownPos.current.y)
        if (dx < 5 && dy < 5) {
          close()
        }
      }
      pointerDownPos.current = null
    },
    [close]
  )

  const handleOverlayClick = useCallback(() => {
    close()
  }, [close])

  return (
    <AnimatePresence onExitComplete={reset}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 h-dvh"
          onClick={handleOverlayClick}
        >
          {/* Close button */}
          <div className="absolute right-[calc(1rem+env(safe-area-inset-right,0px))] top-[calc(1rem+env(safe-area-inset-top,0px))] z-10">
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

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute left-[calc(1rem+env(safe-area-inset-left,0px))] top-[calc(1rem+env(safe-area-inset-top,0px))] z-10">
              <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
                {currentIndex + 1} / {images.length}
              </div>
            </div>
          )}

          {/* Image carousel */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {images.length === 1 ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative flex size-full items-center justify-center safe-area-x"
              >
                <img
                  src={images[0]}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              </motion.div>
            ) : (
              <div
                ref={emblaRef}
                className="size-full min-h-0 overflow-hidden touch-manipulation"
                onPointerDown={handleCarouselPointerDown}
                onClick={handleCarouselClick}
              >
                <div className="flex size-full min-h-0 touch-pan-y will-change-transform">
                  {images.map((src, index) => (
                    <div
                      key={src}
                      className="flex min-h-0 min-w-0 flex-[0_0_100%] items-center justify-center will-change-transform"
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
                    emblaApi?.scrollPrev()
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
                    emblaApi?.scrollNext()
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
