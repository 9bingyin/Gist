import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFolders, deleteFolder, updateFolderType } from '@/api'
import type { ContentType } from '@/types/api'

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: listFolders,
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
    },
  })
}

export function useUpdateFolderType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; type: ContentType }) =>
      updateFolderType(payload.id, payload.type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })
}
