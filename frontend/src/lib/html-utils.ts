import { NON_CONTENT_TAG_SELECTOR } from './html-content-tags'

/**
 * Strip HTML tags and return plain text content
 */
export function stripHtml(html: string): string {
  if (!html) {
    return ''
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll(NON_CONTENT_TAG_SELECTOR).forEach((element) => element.remove())
  return doc.body.textContent || ''
}
