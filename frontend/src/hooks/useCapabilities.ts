import { useAuth } from '@/contexts/AuthContext'
import { emptyCapabilities, hasAnyPermission, hasPermission } from '@/services/capabilities'

export function useCapabilities() {
  const { capabilities = emptyCapabilities } = useAuth() as ReturnType<typeof useAuth> & { capabilities?: typeof emptyCapabilities }
  return {
    capabilities,
    hasPermission: (permissionKey: string) => hasPermission(capabilities, permissionKey),
    hasAnyPermission: (permissionKeys: string[]) => hasAnyPermission(capabilities, permissionKeys),
  }
}
