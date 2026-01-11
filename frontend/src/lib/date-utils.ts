type TranslateFunction = (key: string, options?: Record<string, unknown>) => string

// Time constants in seconds
const MINUTE = 60
const HOUR = 3600
const DAY = 86400
const WEEK = 604800

export function formatRelativeTime(dateString: string, t: TranslateFunction): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  // Future date: show absolute date
  if (diffInSeconds < 0) {
    return date.toLocaleDateString()
  }

  if (diffInSeconds < MINUTE) return t('add_feed.just_now')
  if (diffInSeconds < HOUR) {
    const minutes = Math.floor(diffInSeconds / MINUTE)
    return t('add_feed.minutes_ago', { count: minutes })
  }
  if (diffInSeconds < DAY) {
    const hours = Math.floor(diffInSeconds / HOUR)
    return t('add_feed.hours_ago', { count: hours })
  }
  if (diffInSeconds < WEEK) {
    const days = Math.floor(diffInSeconds / DAY)
    return t('add_feed.days_ago', { count: days })
  }

  return date.toLocaleDateString()
}
