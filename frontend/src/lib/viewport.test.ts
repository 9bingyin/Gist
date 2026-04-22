import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupViewportHeightSync, syncViewportHeight } from './viewport'

describe('viewport', () => {
  const originalInnerHeight = window.innerHeight
  const originalVisibilityState = document.visibilityState

  beforeEach(() => {
    document.documentElement.style.removeProperty('--app-dvh')
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => originalVisibilityState,
    })
  })

  it('should sync current viewport height to css variable', () => {
    syncViewportHeight()

    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('800px')
  })

  it('should resync on resize, pageshow and visible state restore', () => {
    const cleanup = setupViewportHeightSync()

    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('800px')

    window.innerHeight = 720
    window.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('720px')

    window.innerHeight = 680
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('680px')

    window.innerHeight = 640
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('640px')

    cleanup()
  })

  it('should stop syncing after cleanup', () => {
    const cleanup = setupViewportHeightSync()

    cleanup()
    window.innerHeight = 600
    window.dispatchEvent(new Event('resize'))

    expect(document.documentElement.style.getPropertyValue('--app-dvh')).toBe('800px')
  })
})
