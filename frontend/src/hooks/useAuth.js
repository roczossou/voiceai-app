import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth.js'
import { useAuthStore } from '../store/auth.store.js'
import { queryClient } from '../lib/query-client.js'

export function useMe() {
  const isAuthenticated = useAuthStore(s => s.user !== null && s.accessToken !== null)
  return useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    enabled: isAuthenticated,
    staleTime: Infinity,
  })
}

export function useLogin() {
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user, data.token)
      queryClient.setQueryData(['me'], data)
      navigate('/dashboard')
    },
  })
}

export function useRegister() {
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setAuth(data.user, data.token)
      queryClient.setQueryData(['me'], data)
      navigate('/dashboard')
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore(s => s.clearAuth)
  const navigate = useNavigate()
  return () => {
    clearAuth()
    queryClient.clear()
    navigate('/login')
  }
}
