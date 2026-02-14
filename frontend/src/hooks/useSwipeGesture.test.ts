import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSwipeGesture } from './useSwipeGesture'

describe('useSwipeGesture', () => {
  let element: HTMLDivElement
  let ref: React.RefObject<HTMLDivElement>

  beforeEach(() => {
    element = document.createElement('div')
    document.body.appendChild(element)
    ref = { current: element }
  })

  afterEach(() => {
    document.body.removeChild(element)
  })

  const createTouchEvent = (
    type: 'touchstart' | 'touchmove' | 'touchend',
    x: number,
    y: number
  ) => {
    const touch = { clientX: x, clientY: y }
    const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [touch],
    })
    return event
  }

  it('should detect right swipe', () => {
    const onSwipeRight = vi.fn()

    renderHook(() => useSwipeGesture(ref, { onSwipeRight }))

    element.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 110, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 120, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 180, 100))
    element.dispatchEvent(createTouchEvent('touchend', 180, 100))

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })

  it('should detect left swipe', () => {
    const onSwipeLeft = vi.fn()

    renderHook(() => useSwipeGesture(ref, { onSwipeLeft }))

    element.dispatchEvent(createTouchEvent('touchstart', 200, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 190, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 180, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 120, 100))
    element.dispatchEvent(createTouchEvent('touchend', 120, 100))

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })

  it('should not trigger swipe if below threshold', () => {
    const onSwipeRight = vi.fn()

    renderHook(() => useSwipeGesture(ref, { onSwipeRight, threshold: 50 }))

    element.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 110, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 130, 100))
    element.dispatchEvent(createTouchEvent('touchend', 130, 100))

    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('should distinguish between vertical scroll and horizontal swipe', () => {
    const onSwipeRight = vi.fn()

    renderHook(() => useSwipeGesture(ref, { onSwipeRight }))

    // Primarily vertical movement (should not trigger swipe)
    element.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 110, 120))
    element.dispatchEvent(createTouchEvent('touchmove', 120, 150))
    element.dispatchEvent(createTouchEvent('touchend', 120, 150))

    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('should only trigger enabled directions', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()

    renderHook(() =>
      useSwipeGesture(ref, {
        onSwipeLeft,
        onSwipeRight,
        enabledDirections: ['right'], // Only right enabled
      })
    )

    // Try right swipe - should work
    element.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 110, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 180, 100))
    element.dispatchEvent(createTouchEvent('touchend', 180, 100))

    expect(onSwipeRight).toHaveBeenCalledTimes(1)

    // Try left swipe - should not work
    element.dispatchEvent(createTouchEvent('touchstart', 200, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 190, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 120, 100))
    element.dispatchEvent(createTouchEvent('touchend', 120, 100))

    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('should call onSwipe with direction', () => {
    const onSwipe = vi.fn()

    renderHook(() => useSwipeGesture(ref, { onSwipe }))

    element.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 110, 100))
    element.dispatchEvent(createTouchEvent('touchmove', 180, 100))
    element.dispatchEvent(createTouchEvent('touchend', 180, 100))

    expect(onSwipe).toHaveBeenCalledWith('right')
  })
})
