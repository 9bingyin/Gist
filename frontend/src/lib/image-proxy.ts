/**
 * Convert relative URL to absolute URL based on the article link
 */
export function toAbsoluteUrl(url: string, baseUrl: string | undefined): string | null {
  if (!url) return null

  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Protocol-relative URL
  if (url.startsWith('//')) {
    return `https:${url}`
  }

  // Data URI or already proxied - return as is
  if (url.startsWith('data:') || url.startsWith('/api/')) {
    return url
  }

  // Relative URL - need base URL
  if (!baseUrl) return null

  try {
    const base = new URL(baseUrl)

    // Absolute path (starts with /)
    if (url.startsWith('/')) {
      return `${base.origin}${url}`
    }

    // Relative path
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1)
    return `${base.origin}${basePath}${url}`
  } catch {
    return null
  }
}

/**
 * Encode string to Base64 URL-safe format
 * Handles Unicode characters by encoding to UTF-8 first
 */
function toBase64Url(str: string): string {
  // Convert Unicode string to UTF-8 bytes, then to base64
  const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  )
  return btoa(utf8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * Get proxied image URL
 */
export function getProxiedImageUrl(src: string, articleUrl?: string): string {
  const absoluteUrl = toAbsoluteUrl(src, articleUrl)
  if (!absoluteUrl) return src

  // Skip data URIs and already proxied URLs
  if (absoluteUrl.startsWith('data:') || absoluteUrl.startsWith('/api/')) {
    return absoluteUrl
  }

  return `/api/proxy/image/${toBase64Url(absoluteUrl)}`
}
