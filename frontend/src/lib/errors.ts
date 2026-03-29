export function isNetworkError(error: unknown): boolean {
  // AbortError (from AbortController timeout) and TimeoutError (from AbortSignal.timeout)
  // are treated as network errors so that callers can show a retry prompt.
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true
  }
  if (!(error instanceof TypeError)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('load failed')
}

export function getErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}
