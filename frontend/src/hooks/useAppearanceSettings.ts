import { useQuery } from '@tanstack/react-query'
import { getAppearanceSettings } from '@/api'

export function useAppearanceSettings() {
  return useQuery({
    queryKey: ['appearanceSettings'],
    queryFn: getAppearanceSettings,
    staleTime: 5 * 60 * 1000,
  })
}
