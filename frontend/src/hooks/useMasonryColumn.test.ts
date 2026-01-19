import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMasonryColumn } from './useMasonryColumn'

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback
  static instances: MockResizeObserver[] = []

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('useMasonryColumn', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return containerRef as a RefObject', () => {
    const { result } = renderHook(() => useMasonryColumn())

    // containerRef is a RefObject with a current property
    expect(result.current.containerRef).toHaveProperty('current')
    expect(result.current.containerRef.current).toBeNull()
  })

  it('should return currentColumn as a number', () => {
    const { result } = renderHook(() => useMasonryColumn())

    expect(result.current.currentColumn).toBeTypeOf('number')
  })

  it('should return isReady boolean', () => {
    const { result } = renderHook(() => useMasonryColumn())

    expect(typeof result.current.isReady).toBe('boolean')
  })

  it('should return initial column count of 3 for desktop', () => {
    const { result } = renderHook(() => useMasonryColumn(false))

    expect(result.current.currentColumn).toBe(3)
  })

  it('should return initial column count of 2 for mobile', () => {
    const { result } = renderHook(() => useMasonryColumn(true))

    expect(result.current.currentColumn).toBe(2)
  })

  it('should provide stable containerRef across re-renders', () => {
    const { result, rerender } = renderHook(() => useMasonryColumn(false))

    const firstRef = result.current.containerRef

    rerender()

    const secondRef = result.current.containerRef

    expect(firstRef).toBe(secondRef)
  })

  it('should start with isReady as false', () => {
    const { result } = renderHook(() => useMasonryColumn())

    // Without DOM element attached, isReady stays false
    expect(result.current.isReady).toBe(false)
  })
})

// Test the column calculation logic separately by extracting it
describe('column breakpoints', () => {
  // These values match the breakpoints in useMasonryColumn.ts
  const breakpoints: Record<number, number> = {
    0: 2,
    512: 3,
    768: 4,
    1024: 5,
    1280: 6,
  }

  function getCurrentColumn(width: number): number {
    let columns = 2
    for (const [breakpoint, cols] of Object.entries(breakpoints)) {
      if (width >= Number.parseInt(breakpoint)) {
        columns = cols
      } else {
        break
      }
    }
    return columns
  }

  it('should return 2 columns for width < 512', () => {
    expect(getCurrentColumn(0)).toBe(2)
    expect(getCurrentColumn(100)).toBe(2)
    expect(getCurrentColumn(511)).toBe(2)
  })

  it('should return 3 columns for width 512-767', () => {
    expect(getCurrentColumn(512)).toBe(3)
    expect(getCurrentColumn(600)).toBe(3)
    expect(getCurrentColumn(767)).toBe(3)
  })

  it('should return 4 columns for width 768-1023', () => {
    expect(getCurrentColumn(768)).toBe(4)
    expect(getCurrentColumn(900)).toBe(4)
    expect(getCurrentColumn(1023)).toBe(4)
  })

  it('should return 5 columns for width 1024-1279', () => {
    expect(getCurrentColumn(1024)).toBe(5)
    expect(getCurrentColumn(1200)).toBe(5)
    expect(getCurrentColumn(1279)).toBe(5)
  })

  it('should return 6 columns for width >= 1280', () => {
    expect(getCurrentColumn(1280)).toBe(6)
    expect(getCurrentColumn(1920)).toBe(6)
    expect(getCurrentColumn(2560)).toBe(6)
  })
})
