import { getProxiedImageUrl } from './image-proxy'
import { isSafeUrl } from './url'

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
    if (src && !src.startsWith('data:') && isSafeUrl(src)) {
      urls.add(src)
    }
  }

  return Array.from(urls)
}

/**
 * Get all images for an entry, combining thumbnailUrl and content images.
 * All URLs are proxied through the backend to handle anti-bot protection.
 */
export function getEntryImages(thumbnailUrl?: string, content?: string, articleUrl?: string): string[] {
  const images: string[] = []

  // Add thumbnail first if it exists
  if (thumbnailUrl) {
    images.push(getProxiedImageUrl(thumbnailUrl, articleUrl))
  }

  // Extract images from content
  if (content) {
    const contentImages = extractImagesFromHtml(content)
    for (const img of contentImages) {
      const proxiedImg = getProxiedImageUrl(img, articleUrl)
      // Avoid duplicates
      if (!images.includes(proxiedImg)) {
        images.push(proxiedImg)
      }
    }
  }

  return images
}
