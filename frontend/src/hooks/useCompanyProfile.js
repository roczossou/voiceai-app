import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { companyApi } from '../api/company.js'

export function useCompanyProfile() {
  return useQuery({
    queryKey: ['company-profile'],
    queryFn: companyApi.get,
  })
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: companyApi.update,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-profile'] }),
  })
}
