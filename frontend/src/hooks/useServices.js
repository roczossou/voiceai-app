import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { servicesApi } from '../api/services.js'

export function useServices(agentId) {
  return useQuery({
    queryKey: ['services', agentId ?? 'all'],
    queryFn: () => servicesApi.list(agentId),
    select: (data) => data.data,
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: servicesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => servicesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: servicesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}
