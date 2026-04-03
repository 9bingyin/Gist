import { layout, prepare, type PreparedText } from '@chenglou/pretext'
import { stripHtml } from '@/lib/html-utils'
import type { Entry } from '@/types/api'

const ITEM_HORIZONTAL_PADDING = 32
const ITEM_VERTICAL_PADDING = 24
const ROW_GAP = 4
const META_ROW_HEIGHT = 16
const TITLE_LINE_HEIGHT = 20
const SUMMARY_LINE_HEIGHT = 16
const TITLE_MAX_LINES = 2
const SUMMARY_MAX_LINES = 2
const TITLE_FALLBACK_TEXT = 'Untitled'
const FONT_FAMILY = '"Segoe UI", Roboto, sans-serif'
const TITLE_FONT = `600 14px ${FONT_FAMILY}`
const SUMMARY_FONT = `400 12px ${FONT_FAMILY}`
const DEFAULT_ITEM_HEIGHT = 100

const preparedTextCache = new Map<string, PreparedText>()

function getPreparedText(text: string, font: string): PreparedText {
  const cacheKey = `${font}\u0000${text}`
  const cached = preparedTextCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const prepared = prepare(text, font)
  preparedTextCache.set(cacheKey, prepared)
  return prepared
}

function measureClampedTextHeight(
  text: string,
  font: string,
  width: number,
  lineHeight: number,
  maxLines: number,
): number {
  if (!text) {
    return 0
  }

  const prepared = getPreparedText(text, font)
  const { lineCount } = layout(prepared, Math.max(width, 1), lineHeight)
  return Math.min(lineCount, maxLines) * lineHeight
}

export function estimateEntryListItemHeight(entry: Entry, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= ITEM_HORIZONTAL_PADDING) {
    return DEFAULT_ITEM_HEIGHT
  }

  const contentWidth = Math.max(Math.floor(containerWidth) - ITEM_HORIZONTAL_PADDING, 1)
  const titleText = entry.title?.trim() || TITLE_FALLBACK_TEXT
  const summaryText = entry.content ? stripHtml(entry.content).slice(0, 150).trim() : ''

  const titleHeight = measureClampedTextHeight(
    titleText,
    TITLE_FONT,
    contentWidth,
    TITLE_LINE_HEIGHT,
    TITLE_MAX_LINES,
  )

  const summaryHeight = measureClampedTextHeight(
    summaryText,
    SUMMARY_FONT,
    contentWidth,
    SUMMARY_LINE_HEIGHT,
    SUMMARY_MAX_LINES,
  )

  return (
    ITEM_VERTICAL_PADDING +
    META_ROW_HEIGHT +
    ROW_GAP +
    titleHeight +
    (summaryHeight > 0 ? ROW_GAP + summaryHeight : 0)
  )
}
