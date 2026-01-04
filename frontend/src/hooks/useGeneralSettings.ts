import { useQuery } from '@tanstack/react-query'
import { getGeneralSettings } from '@/api'

export function useGeneralSettings() {
  return useQuery({
    queryKey: ['generalSettings'],
    queryFn: getGeneralSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
