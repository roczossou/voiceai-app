import { apiClient } from './client.js'

export const llmKeysApi = {
  list: (provider) => apiClient.get('/llm-keys', { params: { provider } }).then(r => r.data),
  create: (data) => apiClient.post('/llm-keys', data).then(r => r.data),
  update: (id, data) => apiClient.patch(`/llm-keys/${id}`, data).then(r => r.data),
  delete: (id) => apiClient.delete(`/llm-keys/${id}`).then(r => r.data),
}
