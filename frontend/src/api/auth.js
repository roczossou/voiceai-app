import { apiClient } from './client.js'

export const authApi = {
  register: (data) => apiClient.post('/auth/register', data).then(r => r.data),
  login: (data) => apiClient.post('/auth/login', data).then(r => r.data),
  me: () => apiClient.get('/auth/me').then(r => r.data),
}
