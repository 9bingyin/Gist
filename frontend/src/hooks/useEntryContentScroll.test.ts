import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEntryContentScroll } from './useEntryContentScroll'

describe('useEntryContentScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return scrollRef function and isAtTop boolean', () => {
    const { result } = renderHook(() => useEntryContentScroll('entry-1'))

    expect(result.current.scrollRef).toBeTypeOf('function')
    expect(typeof result.current.isAtTop).toBe('boolean')
  })

  it('should return isAtTop as true initially', () => {
    const { result } = renderHook(() => useEntryContentScroll('entry-1'))

    expect(result.current.isAtTop).toBe(true)
  })

  it('should return isAtTop as true when entryId is null', () => {
    const { result } = renderHook(() => useEntryContentScroll(null))

    expect(result.current.isAtTop).toBe(true)
  })

  it('should provide stable scrollRef across re-renders', () => {
    const { result, rerender } = renderHook(() => useEntryContentScroll('entry-1'))

    const firstRef = result.current.scrollRef

    rerender()

    const secondRef = result.current.scrollRef

    expect(firstRef).toBe(secondRef)
  })

  it('should return isAtTop true when switching entries before effect runs', () => {
    const { result, rerender } = renderHook(({ entryId }) => useEntryContentScroll(entryId), {
      initialProps: { entryId: 'entry-1' },
    })

    // isAtTop should be true for entry-1
    expect(result.current.isAtTop).toBe(true)

    // Change to entry-2 - should immediately return true
    rerender({ entryId: 'entry-2' })

    // Even before effect processes, isAtTop should be true
    expect(result.current.isAtTop).toBe(true)
  })

  it('should handle null to valid entryId transition', () => {
    const { result, rerender } = renderHook(({ entryId }) => useEntryContentScroll(entryId), {
      initialProps: { entryId: null as string | null },
    })

    expect(result.current.isAtTop).toBe(true)

    rerender({ entryId: 'entry-1' })

    expect(result.current.isAtTop).toBe(true)
  })

  it('should handle valid to null entryId transition', () => {
    const { result, rerender } = renderHook(({ entryId }) => useEntryContentScroll(entryId), {
      initialProps: { entryId: 'entry-1' as string | null },
    })

    expect(result.current.isAtTop).toBe(true)

    rerender({ entryId: null })

    expect(result.current.isAtTop).toBe(true)
  })

  it('should call scrollRef callback without error', () => {
    const { result } = renderHook(() => useEntryContentScroll('entry-1'))

    // Test with element
    const mockElement = document.createElement('div')
    expect(() => {
      act(() => {
        result.current.scrollRef(mockElement)
      })
    }).not.toThrow()

    // Test with null
    expect(() => {
      act(() => {
        result.current.scrollRef(null)
      })
    }).not.toThrow()
  })
})

// Test the scroll threshold logic
describe('scroll threshold logic', () => {
  const SCROLL_TOP_THRESHOLD = 48

  function isAtTop(scrollTop: number): boolean {
    return scrollTop < SCROLL_TOP_THRESHOLD
  }

  it('should return true when scrollTop is 0', () => {
    expect(isAtTop(0)).toBe(true)
  })

  it('should return true when scrollTop is less than threshold', () => {
    expect(isAtTop(10)).toBe(true)
    expect(isAtTop(47)).toBe(true)
  })

  it('should return false when scrollTop equals threshold', () => {
    expect(isAtTop(48)).toBe(false)
  })

  it('should return false when scrollTop exceeds threshold', () => {
    expect(isAtTop(49)).toBe(false)
    expect(isAtTop(100)).toBe(false)
    expect(isAtTop(1000)).toBe(false)
  })
})
