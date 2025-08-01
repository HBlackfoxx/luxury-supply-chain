import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { getApiForOrganization } from '@/lib/api-config'

export function useApi() {
  const { user } = useAuthStore()
  
  const api = useMemo(() => {
    if (!user?.organization) return null
    return getApiForOrganization(user.organization)
  }, [user?.organization])
  
  return api
}