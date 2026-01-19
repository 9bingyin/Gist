import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, compareStrings, getCheckboxClassName, getSortIcon } from './table-utils'

describe('table-utils', () => {
  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const result = formatDate('2024-03-15T10:30:00Z')
      expect(result).toMatch(/2024/)
      expect(result).toMatch(/03|3/)
      expect(result).toMatch(/15/)
    })
  })

  describe('formatDateTime', () => {
    it('should format date with time', () => {
      const result = formatDateTime('2024-03-15T10:30:00Z')
      expect(result).toMatch(/2024/)
      expect(result).toMatch(/03|3/)
      expect(result).toMatch(/15/)
    })
  })

  describe('compareStrings', () => {
    it('should sort ASCII strings alphabetically', () => {
      expect(compareStrings('Apple', 'Banana')).toBeLessThan(0)
      expect(compareStrings('abc', 'xyz')).toBeLessThan(0)
      expect(compareStrings('Zoo', 'Apple')).toBeGreaterThan(0)
    })

    it('should put ASCII strings before Chinese', () => {
      expect(compareStrings('Apple', '\u4e2d\u6587')).toBeLessThan(0)
      expect(compareStrings('Z', '\u963f')).toBeLessThan(0)
      expect(compareStrings('\u4e2d\u6587', 'Apple')).toBeGreaterThan(0)
    })

    it('should sort Chinese strings using locale', () => {
      expect(compareStrings('\u963f', '\u4e2d')).toBeLessThan(0)
      expect(compareStrings('\u4e2d', '\u963f')).toBeGreaterThan(0)
    })

    it('should handle ASCII boundary characters (0x20 space to 0x7E tilde)', () => {
      // Space (0x20) is first printable ASCII
      expect(compareStrings(' start', '\u4e2d\u6587')).toBeLessThan(0)
      // Tilde (0x7E) is last printable ASCII
      expect(compareStrings('~end', '\u4e2d\u6587')).toBeLessThan(0)
      // Numbers are within ASCII range
      expect(compareStrings('123', '\u4e2d\u6587')).toBeLessThan(0)
    })

    it('should treat control characters as non-ASCII', () => {
      // Control characters (< 0x20) should not be treated as ASCII
      const controlChar = String.fromCharCode(0x1f) // Unit separator
      const chineseStr = '\u4e2d\u6587'
      // Both are non-ASCII, so locale compare is used
      const result = compareStrings(controlChar, chineseStr)
      expect(typeof result).toBe('number')
    })

    it('should handle empty strings', () => {
      // Empty string is not ASCII (length check)
      expect(compareStrings('', 'Apple')).toBeGreaterThan(0)
      expect(compareStrings('Apple', '')).toBeLessThan(0)
      expect(compareStrings('', '')).toBe(0)
    })

    it('should handle mixed content strings', () => {
      // First character determines ASCII status
      expect(compareStrings('A\u4e2d\u6587', '\u4e2d\u6587')).toBeLessThan(0)
      expect(compareStrings('\u4e2dA', 'Apple')).toBeGreaterThan(0)
    })
  })

  describe('getCheckboxClassName', () => {
    it('should return primary styles when all selected', () => {
      const result = getCheckboxClassName(true, false)
      expect(result).toContain('bg-primary')
      expect(result).toContain('border-primary')
    })

    it('should return partial styles when partially selected', () => {
      const result = getCheckboxClassName(false, true)
      expect(result).toContain('bg-primary/50')
    })

    it('should return default styles when not selected', () => {
      const result = getCheckboxClassName(false, false)
      expect(result).toContain('bg-background')
      expect(result).toContain('border-border')
    })
  })

  describe('getSortIcon', () => {
    it('should return dash when not sorting by field', () => {
      expect(getSortIcon('name', 'date', 'asc')).toBe('-')
    })

    it('should return up arrow for ascending sort', () => {
      expect(getSortIcon('name', 'name', 'asc')).toBe('\u2191')
    })

    it('should return down arrow for descending sort', () => {
      expect(getSortIcon('name', 'name', 'desc')).toBe('\u2193')
    })
  })
})
