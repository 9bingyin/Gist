/**
 * Extract image URLs from HTML content.
 * Filters out data URIs and returns unique URLs.
 */
export function extractImagesFromHtml(html: string): string[] {
  if (!html) return []

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const imgs = doc.querySelectorAll('img')

  const urls = new Set<string>()

  for (const img of imgs) {
    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
    if (src && !src.startsWith('data:') && isValidImageUrl(src)) {
      urls.add(src)
    }
  }

  return Array.from(urls)
}

/**
 * Check if a URL looks like a valid image URL.
 */
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Get all images for an entry, combining thumbnailUrl and content images.
 */
export function getEntryImages(thumbnailUrl?: string, content?: string): string[] {
  const images: string[] = []

  // Add thumbnail first if it exists
  if (thumbnailUrl) {
    images.push(thumbnailUrl)
  }

  // Extract images from content
  if (content) {
    const contentImages = extractImagesFromHtml(content)
    for (const img of contentImages) {
      // Avoid duplicates
      if (!images.includes(img)) {
        images.push(img)
      }
    }
  }

  return images
}
