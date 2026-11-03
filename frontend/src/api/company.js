import { apiClient } from './client.js'

export const companyApi = {
  get: () => apiClient.get('/tenant/profile').then(r => r.data),
  update: (data) => apiClient.patch('/tenant/profile', data).then(r => r.data),
}
