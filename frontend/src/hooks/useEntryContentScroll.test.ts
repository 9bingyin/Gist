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

// Scroll position save/restore regression tests
describe('scroll position save/restore', () => {
  function createScrollableDiv(): HTMLDivElement {
    const div = document.createElement('div')
    // jsdom supports scrollTop get/set
    Object.defineProperty(div, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    })
    return div
  }

  function simulateScroll(div: HTMLDivElement, scrollTop: number) {
    div.scrollTop = scrollTop
    div.dispatchEvent(new Event('scroll'))
  }

  it('should save scroll position on scroll and restore when returning to same entry', () => {
    const div = createScrollableDiv()
    // Use unique IDs to avoid cross-test Map pollution
    const entryA = `save-restore-A-${Date.now()}`
    const entryB = `save-restore-B-${Date.now()}`

    const { result, rerender } = renderHook(
      ({ entryId }) => useEntryContentScroll(entryId),
      { initialProps: { entryId: entryA } }
    )

    // Attach the scrollable div
    act(() => {
      result.current.scrollRef(div)
    })

    // Scroll to 200 on entry A
    act(() => {
      simulateScroll(div, 200)
    })

    expect(div.scrollTop).toBe(200)

    // Switch to entry B (detach and reattach to simulate remount)
    act(() => {
      result.current.scrollRef(null)
    })
    rerender({ entryId: entryB })
    const divB = createScrollableDiv()
    act(() => {
      result.current.scrollRef(divB)
    })

    // Entry B has no saved position, should be at 0
    expect(divB.scrollTop).toBe(0)

    // Switch back to entry A
    act(() => {
      result.current.scrollRef(null)
    })
    rerender({ entryId: entryA })
    const divA2 = createScrollableDiv()
    act(() => {
      result.current.scrollRef(divA2)
    })

    // Entry A should restore to 200
    expect(divA2.scrollTop).toBe(200)
  })

  it('should update isAtTop based on restored position', () => {
    const div = createScrollableDiv()
    const entryId = `isAtTop-restore-${Date.now()}`

    const { result } = renderHook(() => useEntryContentScroll(entryId))

    // Attach and scroll past threshold
    act(() => {
      result.current.scrollRef(div)
    })
    act(() => {
      simulateScroll(div, 100)
    })

    expect(result.current.isAtTop).toBe(false)

    // Detach and reattach (simulate remount)
    act(() => {
      result.current.scrollRef(null)
    })
    const div2 = createScrollableDiv()
    act(() => {
      result.current.scrollRef(div2)
    })

    // Should restore to 100 and isAtTop should be false
    expect(div2.scrollTop).toBe(100)
    expect(result.current.isAtTop).toBe(false)
  })

  it('should not save position when entryId is null', () => {
    const div = createScrollableDiv()
    const entryId = `null-entry-${Date.now()}`

    const { result, rerender } = renderHook(
      ({ entryId }) => useEntryContentScroll(entryId),
      { initialProps: { entryId: null as string | null } }
    )

    act(() => {
      result.current.scrollRef(div)
    })
    act(() => {
      simulateScroll(div, 150)
    })

    // Switch to a real entry - should start at 0 (null entry's position not leaked)
    act(() => {
      result.current.scrollRef(null)
    })
    rerender({ entryId })
    const div2 = createScrollableDiv()
    act(() => {
      result.current.scrollRef(div2)
    })

    expect(div2.scrollTop).toBe(0)
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
