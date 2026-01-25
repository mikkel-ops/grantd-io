// Shared types for canvas modals

export interface UserDesignerData {
  roles: string[]
  warehouses: string[]
  service_user: string | null
  service_role: string | null
}

export interface RoleDesignerData {
  databases: { name: string; schemas: string[]; is_imported: boolean }[]
  warehouses: string[]
  roles: string[]
  users: string[]
  role_summaries: Record<string, { is_system: boolean }>
  service_user: string | null
  service_role: string | null
}

export interface SqlPreview {
  statements: string[]
  summary: string
}

// Helper to check if a role is the Grantd service role
export const isServiceRole = (roleName: string, serviceRole: string | null): boolean => {
  if (!serviceRole) return false
  return roleName.toUpperCase() === serviceRole.toUpperCase()
}
