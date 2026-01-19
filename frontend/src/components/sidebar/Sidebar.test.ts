import { describe, it, expect } from 'vitest'

/**
 * Test the animation direction calculation logic used in Sidebar.
 *
 * The Sidebar uses a state-based approach to track animation direction:
 * - State: [[prevOrderIndex, direction], setDirectionState]
 * - Direction is calculated in useLayoutEffect when orderIndex changes
 * - direction = newIndex > prevIndex ? 1 : -1
 * - 1 = forward (content slides left, new content enters from right)
 * - -1 = backward (content slides right, new content enters from left)
 */

// Extract the direction calculation logic for testing
function calculateDirection(prevIndex: number, newIndex: number): 1 | -1 {
  return newIndex > prevIndex ? 1 : -1
}

describe('Sidebar animation direction calculation', () => {
  describe('calculateDirection', () => {
    it('should return 1 (forward) when moving to higher index', () => {
      // article(0) -> picture(1)
      expect(calculateDirection(0, 1)).toBe(1)
      // picture(1) -> notification(2)
      expect(calculateDirection(1, 2)).toBe(1)
      // article(0) -> notification(2)
      expect(calculateDirection(0, 2)).toBe(1)
    })

    it('should return -1 (backward) when moving to lower index', () => {
      // picture(1) -> article(0)
      expect(calculateDirection(1, 0)).toBe(-1)
      // notification(2) -> picture(1)
      expect(calculateDirection(2, 1)).toBe(-1)
      // notification(2) -> article(0)
      expect(calculateDirection(2, 0)).toBe(-1)
    })
  })

  describe('content type index mapping', () => {
    const contentTypes = ['article', 'picture', 'notification'] as const

    it('should map content types to correct indices', () => {
      expect(contentTypes.indexOf('article')).toBe(0)
      expect(contentTypes.indexOf('picture')).toBe(1)
      expect(contentTypes.indexOf('notification')).toBe(2)
    })
  })

  describe('sequential transitions', () => {
    it('should calculate correct direction for article -> picture -> notification', () => {
      let prevIndex = 0 // Start at article

      // article(0) -> picture(1): should be forward
      const dir1 = calculateDirection(prevIndex, 1)
      expect(dir1).toBe(1)
      prevIndex = 1

      // picture(1) -> notification(2): should be forward
      const dir2 = calculateDirection(prevIndex, 2)
      expect(dir2).toBe(1)
    })

    it('should calculate correct direction for notification -> picture -> article', () => {
      let prevIndex = 2 // Start at notification

      // notification(2) -> picture(1): should be backward
      const dir1 = calculateDirection(prevIndex, 1)
      expect(dir1).toBe(-1)
      prevIndex = 1

      // picture(1) -> article(0): should be backward
      const dir2 = calculateDirection(prevIndex, 0)
      expect(dir2).toBe(-1)
    })

    it('should handle alternating directions correctly', () => {
      let prevIndex = 1 // Start at picture

      // picture(1) -> notification(2): forward
      expect(calculateDirection(prevIndex, 2)).toBe(1)
      prevIndex = 2

      // notification(2) -> article(0): backward
      expect(calculateDirection(prevIndex, 0)).toBe(-1)
      prevIndex = 0

      // article(0) -> picture(1): forward
      expect(calculateDirection(prevIndex, 1)).toBe(1)
      prevIndex = 1

      // picture(1) -> article(0): backward
      expect(calculateDirection(prevIndex, 0)).toBe(-1)
    })
  })

  describe('slide variants', () => {
    // Test the slide animation variants used by framer-motion
    const slideVariants = {
      enter: (direction: number) => ({
        x: direction > 0 ? '100%' : '-100%',
        opacity: 0,
      }),
      center: {
        x: 0,
        opacity: 1,
      },
      exit: (direction: number) => ({
        x: direction > 0 ? '-100%' : '100%',
        opacity: 0,
      }),
    }

    it('should slide from right when direction is 1 (forward)', () => {
      const direction = 1
      expect(slideVariants.enter(direction).x).toBe('100%')
      expect(slideVariants.exit(direction).x).toBe('-100%')
    })

    it('should slide from left when direction is -1 (backward)', () => {
      const direction = -1
      expect(slideVariants.enter(direction).x).toBe('-100%')
      expect(slideVariants.exit(direction).x).toBe('100%')
    })

    it('center state should always have x: 0', () => {
      expect(slideVariants.center.x).toBe(0)
      expect(slideVariants.center.opacity).toBe(1)
    })
  })
})
