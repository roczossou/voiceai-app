import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { conversationsApi } from '../api/conversations.js'

export function useConversations(agentId) {
  return useQuery({
    queryKey: ['conversations', agentId],
    queryFn: () => conversationsApi.listByAgent(agentId),
    enabled: !!agentId,
    select: (data) => data.data,
  })
}

export function useConversation(id) {
  return useQuery({
    queryKey: ['conversations', 'detail', id],
    queryFn: () => conversationsApi.get(id),
    enabled: !!id,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: conversationsApi.create,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['conversations', data.agentId] }),
  })
}

export function useAddMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => conversationsApi.addMessage(id, data),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: ['conversations', 'detail', id] }),
  })
}
