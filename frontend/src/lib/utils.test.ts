import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, throttle } from './utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isDisabled = false
      expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
    })

    it('should merge tailwind classes correctly', () => {
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('should handle arrays and objects', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar')
      expect(cn({ active: true, disabled: false })).toBe('active')
    })

    it('should handle empty inputs', () => {
      expect(cn()).toBe('')
      expect(cn('')).toBe('')
      expect(cn(null, undefined)).toBe('')
    })
  })

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should call function immediately on first call', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)

      throttled()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should not call function again within wait period', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)

      throttled()
      throttled()
      throttled()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should call function after wait period expires', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)

      throttled()
      expect(fn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      throttled()
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should schedule trailing call if called during wait period', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)

      throttled() // immediate call
      throttled() // scheduled for later

      expect(fn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should pass arguments to the throttled function', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)

      throttled('arg1', 'arg2')
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('should clear pending timeout when time jumps forward', () => {
      const fn = vi.fn()
      const throttled = throttle(fn, 100)
      const startTime = Date.now()

      throttled() // immediate call at t=0
      expect(fn).toHaveBeenCalledTimes(1)

      throttled() // schedules timeout since remaining > 0
      expect(fn).toHaveBeenCalledTimes(1)

      // Jump time forward without running timers
      vi.setSystemTime(startTime + 200)

      // Now remaining <= 0, but timeoutId exists - should clear it
      throttled()
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
