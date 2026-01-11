type SortDirection = 'asc' | 'desc'

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/**
 * Format date as YYYY-MM-DD HH:mm
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Compare strings with ASCII-first sorting (English before Chinese)
 */
export function compareStrings(a: string, b: string): number {
  const isAscii = (str: string) => /^[\x00-\x7F]/.test(str)
  const aIsAscii = isAscii(a)
  const bIsAscii = isAscii(b)
  if (aIsAscii && !bIsAscii) return -1
  if (!aIsAscii && bIsAscii) return 1
  return a.localeCompare(b, 'zh-CN')
}

/**
 * Get checkbox class name based on selection state
 */
export function getCheckboxClassName(
  isAllSelected: boolean,
  isPartialSelected: boolean
): string {
  if (isAllSelected) {
    return 'border-primary bg-primary text-primary-foreground'
  }
  if (isPartialSelected) {
    return 'border-primary bg-primary/50 text-primary-foreground'
  }
  return 'border-border bg-background hover:border-primary/50'
}

/**
 * Get sort icon character
 */
export function getSortIcon<T extends string>(
  currentField: T,
  targetField: T,
  direction: SortDirection
): string {
  if (currentField !== targetField) return '-'
  return direction === 'asc' ? '\u2191' : '\u2193'
}
