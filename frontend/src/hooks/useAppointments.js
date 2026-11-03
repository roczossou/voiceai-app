import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi } from '../api/appointments.js'

export function useAppointments(agentId) {
  return useQuery({
    queryKey: ['appointments', agentId ?? 'all'],
    queryFn: () => appointmentsApi.list(agentId),
    select: (data) => data.data,
  })
}

export function useCancelAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: appointmentsApi.cancel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}
