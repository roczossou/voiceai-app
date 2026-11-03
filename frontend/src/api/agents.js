import { apiClient } from './client.js'

export const agentsApi = {
  list: () => apiClient.get('/agents').then(r => r.data),
  get: (id) => apiClient.get(`/agents/${id}`).then(r => r.data),
  create: (data) => apiClient.post('/agents', data).then(r => r.data),
  update: (id, data) => apiClient.patch(`/agents/${id}`, data).then(r => r.data),
  delete: (id) => apiClient.delete(`/agents/${id}`).then(r => r.data),
}
