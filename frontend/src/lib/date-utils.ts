type TranslateFunction = (key: string, options?: Record<string, unknown>) => string

export function formatRelativeTime(dateString: string, t: TranslateFunction): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return t('add_feed.just_now')
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return t('add_feed.minutes_ago', { count: minutes })
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return t('add_feed.hours_ago', { count: hours })
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return t('add_feed.days_ago', { count: days })
  }

  return date.toLocaleDateString()
}
