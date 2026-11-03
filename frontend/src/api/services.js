import { apiClient } from './client.js'

export const servicesApi = {
  list: (agentId) => apiClient.get('/services', { params: agentId ? { agentId } : {} }).then(r => r.data),
  get: (id) => apiClient.get(`/services/${id}`).then(r => r.data),
  create: (data) => apiClient.post('/services', data).then(r => r.data),
  update: (id, data) => apiClient.patch(`/services/${id}`, data).then(r => r.data),
  delete: (id) => apiClient.delete(`/services/${id}`).then(r => r.data),
}
