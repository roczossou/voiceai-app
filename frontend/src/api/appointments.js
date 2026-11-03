import { apiClient } from './client.js'

export const appointmentsApi = {
  list: (agentId) => apiClient.get('/appointments', { params: agentId ? { agentId } : {} }).then(r => r.data),
  get: (id) => apiClient.get(`/appointments/${id}`).then(r => r.data),
  cancel: (id) => apiClient.patch(`/appointments/${id}/cancel`).then(r => r.data),
}
