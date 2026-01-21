import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface BackToTopButtonProps {
  scrollNode: HTMLDivElement
  threshold?: number
}

export function BackToTopButton({
  scrollNode,
  threshold = 300
}: BackToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(scrollNode.scrollTop > threshold)
    }

    // Initial check
    handleScroll()

    scrollNode.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollNode.removeEventListener('scroll', handleScroll)
  }, [scrollNode, threshold])

  const handleClick = () => {
    scrollNode.scrollTo({ top: 0, behavior: 'smooth' })
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
