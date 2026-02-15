import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollToTop, dispatchScrollToTop } from './useScrollToTop'

function createScrollableDiv(): HTMLDivElement {
  const div = document.createElement('div')
  div.scrollTo = vi.fn()
  return div
}

// Map element -> visibility for getComputedStyle stub
const visibilityMap = new Map<HTMLElement, string>()
const realGetComputedStyle = window.getComputedStyle

describe('useScrollToTop', () => {
  beforeEach(() => {
    visibilityMap.clear()
    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
      const vis = visibilityMap.get(target as HTMLElement)
      if (vis !== undefined) {
        return { visibility: vis } as CSSStyleDeclaration
      }
      return realGetComputedStyle(target)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should scroll to top when event is dispatched without scope', () => {
    const div = createScrollableDiv()
    visibilityMap.set(div, 'visible')

    renderHook(() => useScrollToTop(div, 'entrylist'))

    act(() => { dispatchScrollToTop() })

    expect(div.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('should scroll to top when event scope matches listener scope', () => {
    const div = createScrollableDiv()
    visibilityMap.set(div, 'visible')

    renderHook(() => useScrollToTop(div, 'entrylist'))

    act(() => { dispatchScrollToTop('entrylist') })

    expect(div.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('should NOT scroll when event scope does not match listener scope', () => {
    const div = createScrollableDiv()
    visibilityMap.set(div, 'visible')

    renderHook(() => useScrollToTop(div, 'entrylist'))

    act(() => { dispatchScrollToTop('entrycontent') })

    expect(div.scrollTo).not.toHaveBeenCalled()
  })

  it('should NOT scroll when element is hidden (visibility: hidden)', () => {
    const div = createScrollableDiv()
    visibilityMap.set(div, 'hidden')

    renderHook(() => useScrollToTop(div, 'entrylist'))

    act(() => { dispatchScrollToTop() })

    expect(div.scrollTo).not.toHaveBeenCalled()
  })

  it('should work with RefObject', () => {
    const div = createScrollableDiv()
    visibilityMap.set(div, 'visible')
    const ref = { current: div }

    renderHook(() => useScrollToTop(ref, 'entrylist'))

    act(() => { dispatchScrollToTop('entrylist') })

    expect(div.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('should not throw when scrollTarget is null', () => {
    renderHook(() => useScrollToTop(null))

    expect(() => {
      act(() => { dispatchScrollToTop() })
    }).not.toThrow()
  })

  it('should isolate multiple listeners with different scopes', () => {
    const listDiv = createScrollableDiv()
    const contentDiv = createScrollableDiv()
    visibilityMap.set(listDiv, 'visible')
    visibilityMap.set(contentDiv, 'visible')

    renderHook(() => useScrollToTop(listDiv, 'entrylist'))
    renderHook(() => useScrollToTop(contentDiv, 'entrycontent'))

    // Scoped to entrylist - only listDiv responds
    act(() => { dispatchScrollToTop('entrylist') })
    expect(listDiv.scrollTo).toHaveBeenCalledTimes(1)
    expect(contentDiv.scrollTo).not.toHaveBeenCalled()

    // Scoped to entrycontent - only contentDiv responds
    act(() => { dispatchScrollToTop('entrycontent') })
    expect(listDiv.scrollTo).toHaveBeenCalledTimes(1)
    expect(contentDiv.scrollTo).toHaveBeenCalledTimes(1)

    // No scope (broadcast) - both respond
    act(() => { dispatchScrollToTop() })
    expect(listDiv.scrollTo).toHaveBeenCalledTimes(2)
    expect(contentDiv.scrollTo).toHaveBeenCalledTimes(2)
  })
})
