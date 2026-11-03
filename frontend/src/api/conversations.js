import { apiClient } from './client.js'

export const conversationsApi = {
  listByAgent: (agentId) => apiClient.get(`/conversations/agent/${agentId}`).then(r => r.data),
  get: (id) => apiClient.get(`/conversations/${id}`).then(r => r.data),
  create: (data) => apiClient.post('/conversations', data).then(r => r.data),
  addMessage: (id, data) => apiClient.post(`/conversations/${id}/messages`, data).then(r => r.data),
}
