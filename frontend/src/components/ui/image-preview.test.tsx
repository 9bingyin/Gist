import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useImagePreviewStore } from '@/stores/image-preview-store'
import { ImagePreview } from './image-preview'

// Mock window.scrollTo (not implemented in jsdom)
vi.stubGlobal('scrollTo', vi.fn())

// Mock embla-carousel-react with controllable API
const mockScrollPrev = vi.fn()
const mockScrollNext = vi.fn()
const mockScrollTo = vi.fn()
const mockSelectedScrollSnap = vi.fn(() => 0)
const mockOn = vi.fn()
const mockOff = vi.fn()

// Store the embla options passed to useEmblaCarousel
let capturedEmblaOptions: { startIndex?: number } = {}

vi.mock('embla-carousel-react', () => ({
  default: (options: { startIndex?: number }) => {
    capturedEmblaOptions = options
    return [
      vi.fn(), // emblaRef
      {
        scrollPrev: mockScrollPrev,
        scrollNext: mockScrollNext,
        scrollTo: mockScrollTo,
        selectedScrollSnap: mockSelectedScrollSnap,
        on: mockOn,
        off: mockOff,
      },
    ]
  },
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children, onExitComplete }: { children: React.ReactNode; onExitComplete?: () => void }) => {
    // Store onExitComplete for testing
    if (onExitComplete) {
      (globalThis as Record<string, unknown>).__mockOnExitComplete = onExitComplete
    }
    return children
  },
  motion: {
    div: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
      <div className={className} onClick={onClick}>{children}</div>
    ),
  },
}))

const mockImages = [
  'https://example.com/img1.jpg',
  'https://example.com/img2.jpg',
  'https://example.com/img3.jpg',
]

describe('ImagePreview', () => {
  beforeEach(() => {
    mockScrollPrev.mockClear()
    mockScrollNext.mockClear()
    mockScrollTo.mockClear()
    mockSelectedScrollSnap.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
    capturedEmblaOptions = {}
    useImagePreviewStore.getState().reset()
  })

  describe('visibility', () => {
    it('should not render content when closed', () => {
      render(<ImagePreview />)

      // ImagePreview should not be visible when closed
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('should render content when open', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      // Should show buttons (close + navigation arrows)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  /**
   * BUG regression test: Opening non-first image shows slide animation from first image
   *
   * Problem: When clicking on the 2nd or 3rd image to open preview, the preview
   * would first show the 1st image and then animate/slide to the clicked image.
   *
   * Root cause: initialIndexRef was only updated when isOpen was false, but at that
   * point the store hadn't been updated with the new currentIndex yet. So when the
   * preview opened, it used the old (stale) initialIndex value.
   *
   * Fix: Track the previous isOpen state with wasOpenRef, and update initialIndexRef
   * when isOpen transitions from false to true (i.e., when preview just opened).
   */
  describe('BUG: opening non-first image shows slide from first', () => {
    it('should initialize Embla with correct startIndex when opening at index 0', () => {
      useImagePreviewStore.getState().open(mockImages, 0)

      render(<ImagePreview />)

      expect(capturedEmblaOptions.startIndex).toBe(0)
    })

    it('should initialize Embla with correct startIndex when opening at index 1', () => {
      useImagePreviewStore.getState().open(mockImages, 1)

      render(<ImagePreview />)

      expect(capturedEmblaOptions.startIndex).toBe(1)
    })

    it('should initialize Embla with correct startIndex when opening at index 2', () => {
      useImagePreviewStore.getState().open(mockImages, 2)

      render(<ImagePreview />)

      expect(capturedEmblaOptions.startIndex).toBe(2)
    })

    it('should NOT slide from first image when opening middle image', () => {
      // This test verifies the fix for the bug where opening image at index 1
      // would first show image 0 and then slide to image 1

      useImagePreviewStore.getState().open(mockImages, 1)

      render(<ImagePreview />)

      // Embla should be initialized at index 1, not 0
      // This is the key fix - before the bug fix, startIndex would be 0
      expect(capturedEmblaOptions.startIndex).toBe(1)

      // Note: scrollTo may be called by the sync effect, but since startIndex
      // is already correct, it won't cause a visible slide animation
    })

    it('should use new startIndex when reopening at different index', () => {
      // First open at index 0
      useImagePreviewStore.getState().open(mockImages, 0)
      const { unmount } = render(<ImagePreview />)
      expect(capturedEmblaOptions.startIndex).toBe(0)

      // Close and reset
      act(() => {
        useImagePreviewStore.getState().close()
        useImagePreviewStore.getState().reset()
      })
      unmount()

      // Reopen at index 2
      useImagePreviewStore.getState().open(mockImages, 2)
      render(<ImagePreview />)

      // Should use new index, not the old one
      expect(capturedEmblaOptions.startIndex).toBe(2)
    })
  })

  /**
   * BUG regression test: Carousel slides not filling full viewport width
   *
   * Problem: When swiping between images, the previous image would still be
   * partially visible on the left edge instead of being completely off-screen.
   *
   * Root cause: The carousel container had `safe-area-x` class which adds
   * responsive padding (sm: 1rem, lg: 3rem). This made the container narrower
   * than the viewport, but each slide was set to `flex-[0_0_100%]` of the
   * container width, not the viewport width.
   *
   * Fix: Remove `safe-area-x` from the carousel container so slides fill the
   * full viewport width. Single image mode can keep safe-area-x on its inner
   * container since it doesn't use Embla carousel.
   */
  describe('BUG: carousel slides not filling full viewport width', () => {
    it('should NOT have safe-area-x class on carousel container', () => {
      useImagePreviewStore.getState().open(mockImages)

      const { container } = render(<ImagePreview />)

      // Find the carousel container (the one that wraps embla slides)
      // It should be the parent of the flex container with slide items
      const carouselContainer = container.querySelector('.overflow-hidden.touch-manipulation')

      // The carousel container should exist
      expect(carouselContainer).not.toBeNull()

      // Find its parent (the flex container that was causing the bug)
      const carouselWrapper = carouselContainer?.parentElement
      expect(carouselWrapper).not.toBeNull()

      // The wrapper should NOT have safe-area-x class (this was the bug)
      expect(carouselWrapper?.className).not.toContain('safe-area-x')
    })

    it('should have slides with full width (flex-[0_0_100%])', () => {
      useImagePreviewStore.getState().open(mockImages)

      const { container } = render(<ImagePreview />)

      // Find slide containers
      const slides = container.querySelectorAll('.flex-\\[0_0_100\\%\\]')

      // Should have 3 slides
      expect(slides.length).toBe(3)

      // Each slide should NOT have responsive padding that would reduce content width
      slides.forEach(slide => {
        // Should not have the old px-0 sm:px-2 lg:px-4 classes
        expect(slide.className).not.toContain('sm:px-2')
        expect(slide.className).not.toContain('lg:px-4')
      })
    })

    it('single image mode should have safe-area-x on its container', () => {
      // Single image doesn't use Embla carousel, so it can have safe-area-x
      useImagePreviewStore.getState().open(['https://example.com/single.jpg'])

      const { container } = render(<ImagePreview />)

      // For single image, there should be a container with safe-area-x
      const singleImageContainer = container.querySelector('.safe-area-x')
      expect(singleImageContainer).not.toBeNull()
    })
  })

  describe('keyboard navigation', () => {
    it('should close preview on Escape key', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      expect(useImagePreviewStore.getState().isOpen).toBe(true)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(useImagePreviewStore.getState().isOpen).toBe(false)
    })

    it('should call scrollNext on ArrowRight key', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      fireEvent.keyDown(document, { key: 'ArrowRight' })

      expect(mockScrollNext).toHaveBeenCalled()
    })

    it('should call scrollPrev on ArrowLeft key', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      fireEvent.keyDown(document, { key: 'ArrowLeft' })

      expect(mockScrollPrev).toHaveBeenCalled()
    })
  })

  describe('navigation arrows', () => {
    it('should show navigation arrows when multiple images', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      const buttons = screen.getAllByRole('button')
      // Should have close button + 2 arrow buttons
      const arrowButtons = buttons.filter(btn =>
        btn.className.includes('absolute') &&
        (btn.className.includes('left-4') || btn.className.includes('right-4'))
      )
      expect(arrowButtons.length).toBe(2)
    })

    it('should NOT show navigation arrows for single image', () => {
      useImagePreviewStore.getState().open(['https://example.com/single.jpg'])

      render(<ImagePreview />)

      const buttons = screen.getAllByRole('button')
      // Should only have close button
      const arrowButtons = buttons.filter(btn =>
        btn.className.includes('left-4') && btn.className.includes('absolute')
      )
      expect(arrowButtons.length).toBe(0)
    })

    it('should call emblaApi.scrollNext when clicking next arrow', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      const buttons = screen.getAllByRole('button')
      const nextButton = buttons.find(btn =>
        btn.className.includes('right-4') && btn.className.includes('absolute')
      )
      expect(nextButton).toBeDefined()

      fireEvent.click(nextButton!)
      expect(mockScrollNext).toHaveBeenCalled()
    })

    it('should call emblaApi.scrollPrev when clicking prev arrow', () => {
      useImagePreviewStore.getState().open(mockImages, 1)

      render(<ImagePreview />)

      const buttons = screen.getAllByRole('button')
      const prevButton = buttons.find(btn =>
        btn.className.includes('left-4') && btn.className.includes('absolute')
      )
      expect(prevButton).toBeDefined()

      fireEvent.click(prevButton!)
      expect(mockScrollPrev).toHaveBeenCalled()
    })
  })

  describe('image counter', () => {
    it('should display image counter for multiple images', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      expect(screen.getByText('1 / 3')).toBeDefined()
    })

    it('should NOT display image counter for single image', () => {
      useImagePreviewStore.getState().open(['https://example.com/single.jpg'])

      render(<ImagePreview />)

      expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull()
    })
  })

  /**
   * Scroll lock tests - verify body scroll is locked when preview is open
   */
  describe('scroll lock', () => {
    beforeEach(() => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    })

    it('should lock body scroll when open (non-iOS)', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      expect(document.body.style.position).toBe('fixed')
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('should unlock body scroll when closed', () => {
      useImagePreviewStore.getState().open(mockImages)

      const { unmount } = render(<ImagePreview />)

      expect(document.body.style.position).toBe('fixed')

      act(() => {
        useImagePreviewStore.getState().close()
        useImagePreviewStore.getState().reset()
      })

      unmount()

      expect(document.body.style.position).toBe('')
      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('Embla event listeners', () => {
    it('should register event listener on emblaApi', () => {
      useImagePreviewStore.getState().open(mockImages)

      render(<ImagePreview />)

      expect(mockOn).toHaveBeenCalledWith('select', expect.any(Function))
    })

    it('should clean up event listener on unmount', () => {
      useImagePreviewStore.getState().open(mockImages)

      const { unmount } = render(<ImagePreview />)

      unmount()

      expect(mockOff).toHaveBeenCalledWith('select', expect.any(Function))
    })
  })
})
