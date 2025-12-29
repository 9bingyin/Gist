import { useQuery } from '@tanstack/react-query'
import { listFeeds } from '@/api'

export function useFeeds() {
  return useQuery({
    queryKey: ['feeds'],
    queryFn: () => listFeeds(),
  })
}
