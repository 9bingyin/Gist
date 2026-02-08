import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRefreshStatus } from '@/api'

/**
 * Polls the backend refresh status and automatically invalidates
 * entries/unreadCounts/feeds caches when a scheduled refresh completes.
 *
 * Mount this hook once at the app level (e.g., AuthenticatedApp).
 */
export function useRefreshStatus() {
  const queryClient = useQueryClient()
  // null = not initialized (haven't received first response yet)
  // undefined = server returned no lastRefreshedAt (no refresh has happened)
  // string = last known timestamp
  const prevTimestampRef = useRef<string | undefined | null>(null)

  const { data } = useQuery({
    queryKey: ['refreshStatus'],
    queryFn: getRefreshStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!data) return

    const current = data.lastRefreshedAt
    if (prevTimestampRef.current !== null && prevTimestampRef.current !== current) {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    }
    prevTimestampRef.current = current
  }, [data, queryClient])
}
