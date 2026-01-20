import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLightboxStore } from '@/stores/lightbox-store'
import { Lightbox } from './Lightbox'
import type { Entry, Feed } from '@/types/api'

// Mock window.scrollTo (not implemented in jsdom)
vi.stubGlobal('scrollTo', vi.fn())

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Create a wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Mock embla-carousel-react with controllable API
const mockScrollPrev = vi.fn()
const mockScrollNext = vi.fn()
const mockScrollTo = vi.fn()
const mockSelectedScrollSnap = vi.fn(() => 0)
const mockOn = vi.fn()
const mockOff = vi.fn()

vi.mock('embla-carousel-react', () => ({
  default: () => [
    vi.fn(), // emblaRef
    {
      scrollPrev: mockScrollPrev,
      scrollNext: mockScrollNext,
      scrollTo: mockScrollTo,
      selectedScrollSnap: mockSelectedScrollSnap,
      on: mockOn,
      off: mockOff,
    },
  ],
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
      <div className={className} onClick={onClick}>{children}</div>
    ),
  },
}))

const mockVideoEntry: Entry = {
  id: '1',
  feedId: '100',
  title: 'Video Entry',
  url: 'https://example.com/video',
  content: '<p>Video content</p>',
  thumbnailUrl: 'https://example.com/video_thumb_123.jpg', // Contains 'video_thumb'
  author: 'Test Author',
  publishedAt: '2024-01-15T10:00:00Z',
  read: false,
  starred: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
}

const mockImageEntry: Entry = {
  id: '2',
  feedId: '100',
  title: 'Image Entry',
  url: 'https://example.com/image',
  content: '<p>Image content</p>',
  thumbnailUrl: 'https://example.com/image.jpg', // Regular image
  author: 'Test Author',
  publishedAt: '2024-01-15T10:00:00Z',
  read: false,
  starred: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
}

const mockFeed: Feed = {
  id: '100',
  title: 'Test Feed',
  url: 'https://example.com/feed.xml',
  siteUrl: 'https://example.com',
  type: 'picture',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
}

// Multiple images for carousel tests
const mockMultipleImages = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/image3.jpg',
]

describe('Lightbox', () => {
  beforeEach(() => {
    // Reset all mocks
    mockScrollPrev.mockClear()
    mockScrollNext.mockClear()
    mockScrollTo.mockClear()
    mockSelectedScrollSnap.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
    useLightboxStore.getState().reset()
  })

  /**
   * BUG regression test: Video play button click area was too large
   *
   * Problem: The video play overlay link used `absolute inset-0` which made
   * the entire lightbox area clickable, instead of just the play button.
   *
   * Root cause: `inset-0` equals `top:0; right:0; bottom:0; left:0;`, which
   * expanded the link to cover the entire parent container (full screen).
   *
   * Fix: Remove `inset-0` so the link naturally wraps only the Play icon.
   * Also added `stopPropagation()` to prevent closing lightbox on click.
   */
  describe('BUG: video play button click area too large', () => {
    // Helper to find the video play button link (contains Play icon with size-20)
    const findVideoPlayLink = () => {
      const links = screen.queryAllByRole('link')
      return links.find(link => {
        // The video play link has the Play icon with size-20 class
        const svg = link.querySelector('svg')
        return svg?.classList.contains('size-20')
      })
    }

    it('should NOT have inset-0 class on video play link (was covering entire lightbox)', () => {
      // Open lightbox with video entry
      useLightboxStore.getState().open(
        mockVideoEntry,
        mockFeed,
        [mockVideoEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find the play button link (has Play icon with size-20)
      const playLink = findVideoPlayLink()
      expect(playLink).toBeDefined()

      // Verify the link does NOT have inset-0 class (the bug)
      expect(playLink!.className).not.toContain('inset-0')

      // Verify it still has absolute positioning for centering
      expect(playLink!.className).toContain('absolute')
    })

    it('should only show play button for video thumbnails', () => {
      // Open lightbox with regular image entry
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // For regular images, the play button should NOT appear
      const playLink = findVideoPlayLink()
      expect(playLink).toBeUndefined()
    })

    it('should have correct link attributes on video play button', () => {
      useLightboxStore.getState().open(
        mockVideoEntry,
        mockFeed,
        [mockVideoEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      const playLink = findVideoPlayLink()
      expect(playLink).toBeDefined()

      // Link should be properly configured
      expect(playLink!.getAttribute('href')).toBe(mockVideoEntry.url)
      expect(playLink!.getAttribute('target')).toBe('_blank')
      expect(playLink!.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  describe('lightbox visibility', () => {
    it('should not render content when closed', () => {
      render(<Lightbox />, { wrapper: createWrapper() })

      // Lightbox should not be visible when closed (no h-dvh container)
      expect(screen.queryByText('Test Feed')).toBeNull()
    })

    it('should render content when open', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Should show feed title and entry title
      expect(screen.getByText('Test Feed')).toBeDefined()
      expect(screen.getByText('Image Entry')).toBeDefined()
    })
  })

  /**
   * BUG regression test: Background page scrollable on mobile touch
   *
   * Problem: When lightbox is open, the background page could still be scrolled
   * on mobile devices (especially iOS Safari) using touch gestures.
   *
   * Root cause: Using only `overflow: hidden` on body is insufficient for iOS Safari.
   * iOS Safari ignores overflow:hidden for touch scroll events.
   *
   * Fix: Use `position: fixed` with `top: -scrollY` to lock the body in place,
   * then restore scroll position when closing. This is the standard solution
   * for iOS Safari scroll lock.
   */
  describe('BUG: background page scrollable on mobile touch', () => {
    beforeEach(() => {
      // Reset body styles before each test
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
    })

    it('should use position:fixed to lock body scroll (not just overflow:hidden)', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Body should have position: fixed (iOS Safari requirement)
      expect(document.body.style.position).toBe('fixed')
      // Body should have overflow: hidden
      expect(document.body.style.overflow).toBe('hidden')
      // Body should have left and right set to prevent width change
      expect(document.body.style.left).toBe('0px')
      expect(document.body.style.right).toBe('0px')
    })

    it('should set body top based on scroll position', () => {
      // Simulate a scroll position (jsdom doesn't support scrollY well, but we test the logic)
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Body top should be set (even if 0 in jsdom)
      expect(document.body.style.top).toMatch(/^-?\d+px$/)
    })

    it('should clear body styles when lightbox closes', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      const { unmount } = render(<Lightbox />, { wrapper: createWrapper() })

      // Verify styles are applied when open
      expect(document.body.style.position).toBe('fixed')

      // Close the lightbox (wrap in act() to handle state updates)
      act(() => {
        useLightboxStore.getState().close()
        useLightboxStore.getState().reset()
      })

      // Re-render to trigger effect cleanup
      unmount()

      // Body styles should be cleared
      expect(document.body.style.position).toBe('')
      expect(document.body.style.overflow).toBe('')
    })
  })

  /**
   * Multi-image carousel navigation tests
   *
   * Tests for arrow button navigation with smooth animations.
   * The key fix was memoizing Embla options to prevent reInit
   * which would skip animations.
   */
  describe('multi-image carousel navigation', () => {
    it('should show navigation arrows when multiple images', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Should have prev and next buttons
      const buttons = screen.getAllByRole('button')
      // Find arrow buttons (they have size-10 class and arrow SVG paths)
      const arrowButtons = buttons.filter(btn => {
        const svg = btn.querySelector('svg.size-6')
        return svg !== null && btn.className.includes('absolute')
      })
      expect(arrowButtons.length).toBe(2)
    })

    it('should NOT show navigation arrows for single image', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find arrow buttons (absolute positioned with size-6 svg)
      const buttons = screen.getAllByRole('button')
      const arrowButtons = buttons.filter(btn => {
        const svg = btn.querySelector('svg.size-6')
        return svg !== null && btn.className.includes('absolute') && btn.className.includes('left-4')
      })
      expect(arrowButtons.length).toBe(0)
    })

    it('should call emblaApi.scrollNext when clicking next arrow', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find the next button (right arrow)
      const buttons = screen.getAllByRole('button')
      const nextButton = buttons.find(btn =>
        btn.className.includes('right-4') && btn.className.includes('absolute')
      )
      expect(nextButton).toBeDefined()

      fireEvent.click(nextButton!)
      expect(mockScrollNext).toHaveBeenCalled()
    })

    it('should call emblaApi.scrollPrev when clicking prev arrow', () => {
      // Start at index 1 so prev button is visible
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages,
        1
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find the prev button (left arrow)
      const buttons = screen.getAllByRole('button')
      const prevButton = buttons.find(btn =>
        btn.className.includes('left-4') && btn.className.includes('absolute')
      )
      expect(prevButton).toBeDefined()

      fireEvent.click(prevButton!)
      expect(mockScrollPrev).toHaveBeenCalled()
    })

    it('should display image counter for multiple images', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Should show "1 / 3" counter
      expect(screen.getByText('1 / 3')).toBeDefined()
    })

    it('should NOT display image counter for single image', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Should NOT show counter
      expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull()
    })
  })

  /**
   * Keyboard navigation tests
   */
  describe('keyboard navigation', () => {
    it('should close lightbox on Escape key', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Lightbox should be open
      expect(screen.getByText('Test Feed')).toBeDefined()

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' })

      // Store should be closed (but content may still render due to AnimatePresence mock)
      expect(useLightboxStore.getState().isOpen).toBe(false)
    })

    it('should call scrollNext on ArrowRight key', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      fireEvent.keyDown(document, { key: 'ArrowRight' })

      expect(mockScrollNext).toHaveBeenCalled()
    })

    it('should call scrollPrev on ArrowLeft key', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      fireEvent.keyDown(document, { key: 'ArrowLeft' })

      expect(mockScrollPrev).toHaveBeenCalled()
    })
  })

  /**
   * Star button tests
   */
  describe('star button', () => {
    it('should render star button', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find star button by its SVG path (star shape)
      const buttons = screen.getAllByRole('button')
      const starButton = buttons.find(btn => {
        const svg = btn.querySelector('svg.size-5')
        const path = svg?.querySelector('path')
        return path?.getAttribute('d')?.includes('M12 2l3.09')
      })
      expect(starButton).toBeDefined()
    })

    it('should show filled star when entry is starred', () => {
      const starredEntry = { ...mockImageEntry, starred: true }
      useLightboxStore.getState().open(
        starredEntry,
        mockFeed,
        [starredEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find star button
      const buttons = screen.getAllByRole('button')
      const starButton = buttons.find(btn => {
        const svg = btn.querySelector('svg.size-5')
        const path = svg?.querySelector('path')
        return path?.getAttribute('d')?.includes('M12 2l3.09')
      })

      // Should have amber color class when starred
      expect(starButton?.className).toContain('amber')
    })
  })

  /**
   * External link button tests
   */
  describe('external link button', () => {
    it('should render external link button when entry has URL', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        [mockImageEntry.thumbnailUrl!]
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // Find the external link (not the video play link)
      const links = screen.getAllByRole('link')
      const externalLink = links.find(link => {
        const svg = link.querySelector('svg.size-5')
        // External link has a different path than the play button
        return svg !== null && !svg.classList.contains('size-20')
      })

      expect(externalLink).toBeDefined()
      expect(externalLink?.getAttribute('href')).toBe(mockImageEntry.url)
      expect(externalLink?.getAttribute('target')).toBe('_blank')
    })
  })

  /**
   * BUG regression test: Embla options causing reInit and skipping animations
   *
   * Problem: When currentIndex changed, the Embla options object changed
   * (due to startIndex: currentIndex), causing Embla to reInit and skip animations.
   *
   * Fix: Use useMemo to stabilize options and initialIndexRef to capture
   * the starting index only when lightbox opens.
   */
  describe('BUG: Embla reInit skipping animations', () => {
    it('should register event listener on emblaApi', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      render(<Lightbox />, { wrapper: createWrapper() })

      // emblaApi.on should be called to register select event
      expect(mockOn).toHaveBeenCalledWith('select', expect.any(Function))
    })

    it('should clean up event listener on unmount', () => {
      useLightboxStore.getState().open(
        mockImageEntry,
        mockFeed,
        mockMultipleImages
      )

      const { unmount } = render(<Lightbox />, { wrapper: createWrapper() })

      unmount()

      // emblaApi.off should be called to clean up
      expect(mockOff).toHaveBeenCalledWith('select', expect.any(Function))
    })
  })
})
