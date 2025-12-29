import { useQuery } from '@tanstack/react-query'
import { listFolders } from '@/api'

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: listFolders,
  })
}
