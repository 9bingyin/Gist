import { layout, layoutNextLine, prepare, prepareWithSegments } from '@chenglou/pretext'

const META_FONT = '400 12px "Segoe UI", Roboto, sans-serif'
const META_LINE_HEIGHT = 16
const META_SEPARATOR = ' · '
const ELLIPSIS = '...'
const UNBOUNDED_WIDTH = 1_000_000

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }

  return Array.from(text)
}

function measureSingleLineWidth(text: string, font: string): number {
  if (!text) {
    return 0
  }

  const prepared = prepareWithSegments(text, font)
  return layoutNextLine(prepared, { segmentIndex: 0, graphemeIndex: 0 }, UNBOUNDED_WIDTH)?.width ?? 0
}

function fitsSingleLine(text: string, maxWidth: number, font: string, lineHeight: number): boolean {
  if (!text) {
    return true
  }

  return layout(prepare(text, font), Math.max(maxWidth, 1), lineHeight).lineCount <= 1
}

export function truncateSingleLineText(
  text: string,
  maxWidth: number,
  font: string = META_FONT,
  lineHeight: number = META_LINE_HEIGHT,
): string {
  const normalized = text.trim()
  if (!normalized || maxWidth <= 0) {
    return ''
  }

  if (fitsSingleLine(normalized, maxWidth, font, lineHeight)) {
    return normalized
  }

  if (!fitsSingleLine(ELLIPSIS, maxWidth, font, lineHeight)) {
    return ''
  }

  const graphemes = splitGraphemes(normalized)
  let low = 0
  let high = graphemes.length
  let best = ''

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = `${graphemes.slice(0, mid).join('').trimEnd()}${ELLIPSIS}`
    if (fitsSingleLine(candidate, maxWidth, font, lineHeight)) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}

export function buildInlineMetaText(
  title: string,
  publishedAt: string | null,
  maxWidth: number,
  font: string = META_FONT,
  lineHeight: number = META_LINE_HEIGHT,
): string {
  const normalizedTitle = title.trim()
  if (!publishedAt) {
    return truncateSingleLineText(normalizedTitle, maxWidth, font, lineHeight)
  }

  const suffix = `${META_SEPARATOR}${publishedAt}`
  const suffixWidth = measureSingleLineWidth(suffix, font)

  if (suffixWidth >= maxWidth) {
    return truncateSingleLineText(publishedAt, maxWidth, font, lineHeight)
  }

  const titleWidth = Math.max(maxWidth - suffixWidth, 0)
  const truncatedTitle = truncateSingleLineText(normalizedTitle, titleWidth, font, lineHeight)

  if (!truncatedTitle) {
    return truncateSingleLineText(publishedAt, maxWidth, font, lineHeight)
  }

  return `${truncatedTitle}${suffix}`
}
