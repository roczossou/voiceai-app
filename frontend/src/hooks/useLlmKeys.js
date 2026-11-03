import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { llmKeysApi } from '../api/llm-keys.js'

export function useLlmKeys(provider) {
  return useQuery({
    queryKey: ['llm-keys', provider],
    queryFn: () => llmKeysApi.list(provider),
    select: (data) => data.data,
  })
}

export function useCreateLlmKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: llmKeysApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-keys'] }),
  })
}

export function useUpdateLlmKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => llmKeysApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-keys'] }),
  })
}

export function useDeleteLlmKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: llmKeysApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-keys'] }),
  })
}
