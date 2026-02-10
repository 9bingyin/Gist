import { describe, it, expect } from 'vitest'
import { isNetworkError, getErrorMessage } from './errors'

describe('errors', () => {
  describe('isNetworkError', () => {
    it('should return true for Chrome "Failed to fetch"', () => {
      expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    })

    it('should return true for Firefox "NetworkError"', () => {
      expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    })

    it('should return true for Safari "Load failed"', () => {
      expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    })

    it('should return true for "Network request failed"', () => {
      expect(isNetworkError(new TypeError('Network request failed'))).toBe(true)
    })

    it('should return false for non-TypeError errors', () => {
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
      expect(isNetworkError(new RangeError('Failed to fetch'))).toBe(false)
    })

    it('should return false for TypeError with unrelated message', () => {
      expect(isNetworkError(new TypeError('Cannot read property of undefined'))).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isNetworkError('Failed to fetch')).toBe(false)
      expect(isNetworkError(null)).toBe(false)
      expect(isNetworkError(undefined)).toBe(false)
      expect(isNetworkError(42)).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('should return error message from Error instance', () => {
      const error = new Error('Something went wrong')
      expect(getErrorMessage(error)).toBe('Something went wrong')
    })

    it('should return default fallback for non-Error values', () => {
      expect(getErrorMessage('string error')).toBe('Request failed')
      expect(getErrorMessage(123)).toBe('Request failed')
      expect(getErrorMessage(null)).toBe('Request failed')
      expect(getErrorMessage(undefined)).toBe('Request failed')
      expect(getErrorMessage({ message: 'object' })).toBe('Request failed')
    })

    it('should return custom fallback when provided', () => {
      expect(getErrorMessage('string error', 'Custom fallback')).toBe('Custom fallback')
      expect(getErrorMessage(null, 'Network error')).toBe('Network error')
    })
  })
})
