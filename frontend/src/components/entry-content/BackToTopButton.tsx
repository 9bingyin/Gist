import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface BackToTopButtonProps {
  /** Inner scroll container (desktop). When omitted, uses window scroll (mobile). */
  scrollNode?: HTMLDivElement | null
  threshold?: number
}

export function BackToTopButton({
  scrollNode,
  threshold = 300
}: BackToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false)
  const useWindow = !scrollNode

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = useWindow ? window.scrollY : scrollNode!.scrollTop
      setIsVisible(scrollTop > threshold)
    }

    // Initial check
    handleScroll()

    const target = useWindow ? window : scrollNode!
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => target.removeEventListener('scroll', handleScroll)
  }, [scrollNode, threshold, useWindow])

  const handleClick = () => {
    if (useWindow) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      scrollNode!.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'fixed bottom-6 right-6 z-30',
        'flex size-10 items-center justify-center rounded-full',
        'bg-background/80 backdrop-blur border border-border shadow-lg',
        'text-muted-foreground hover:text-foreground hover:bg-background',
        'transition-all duration-300',
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      )}
      aria-label="Back to top"
    >
      <svg
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 15l7-7 7 7"
        />
      </svg>
    </button>
  )
}
