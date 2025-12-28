/**
 * Validates if a URL uses a safe protocol (http or https only)
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Safely extracts hostname from a URL string
 * Returns undefined if URL is invalid or uses unsafe protocol
 */
export function getSafeHostname(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }
    return parsed.hostname
  } catch {
    return undefined
  }
}

/**
 * Normalizes a user input URL by adding https:// if missing
 * Returns null if the result is not a valid URL
 */
export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  let url = trimmed

  if (url.startsWith('feed://')) {
    url = url.replace('feed://', 'https://')
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  // Validate the normalized URL
  if (!isSafeUrl(url)) {
    return null
  }

  return url
}
