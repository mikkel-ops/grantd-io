import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Shield,
  Loader2,
  Database,
  Users,
  ChevronDown,
  ChevronRight,
  Check,
  Code,
  ArrowRight,
  Plus,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface Connection {
  id: string
  name: string
  platform: string
}

interface DatabaseInfo {
  name: string
  schemas: string[]
  is_imported: boolean
}

interface RoleDesignerData {
  databases: DatabaseInfo[]
  roles: string[]
  users: string[]
}

interface PrivilegeSpec {
  privilege: string
  object_type: string
  object_name: string
  is_imported_database?: boolean
}

interface SqlPreviewResponse {
  statements: string[]
  summary: string
}

interface RolePrivilegesResponse {
  role_name: string
  description: string | null
  inherited_roles: string[]
  privileges: PrivilegeSpec[]
  assigned_to_users: string[]
  assigned_to_roles: string[]
}

const SNOWFLAKE_PRIVILEGES = {
  DATABASE: ['USAGE', 'MONITOR', 'CREATE SCHEMA'],
  SCHEMA: ['USAGE', 'MONITOR', 'CREATE TABLE', 'CREATE VIEW', 'CREATE STAGE', 'CREATE FILE FORMAT', 'CREATE SEQUENCE', 'CREATE FUNCTION', 'CREATE PROCEDURE'],
  TABLE: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'],
  VIEW: ['SELECT', 'REFERENCES'],
}

export default function RoleDesignerPage() {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const connectionIdParam = searchParams.get('connection_id')
  const editRoleParam = searchParams.get('edit_role')

  // Edit mode state
  const isEditMode = !!editRoleParam
  const [originalPrivileges, setOriginalPrivileges] = useState<PrivilegeSpec[]>([])
  const [originalInheritedRoles, setOriginalInheritedRoles] = useState<string[]>([])
  const [originalAssignedUsers, setOriginalAssignedUsers] = useState<string[]>([])
  const [originalAssignedRoles, setOriginalAssignedRoles] = useState<string[]>([])
  const [editDataLoading, setEditDataLoading] = useState(false)

  // State
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(connectionIdParam)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [designerData, setDesignerData] = useState<RoleDesignerData | null>(null)

  // Role design state
  const [roleName, setRoleName] = useState('')
  const [description, setDescription] = useState('')
  const [inheritFromRoles, setInheritFromRoles] = useState<string[]>([])
  const [privileges, setPrivileges] = useState<PrivilegeSpec[]>([])
  const [assignToUsers, setAssignToUsers] = useState<string[]>([])
  const [assignToRoles, setAssignToRoles] = useState<string[]>([])

  // UI state
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set())
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [sqlPreview, setSqlPreview] = useState<SqlPreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<Connection[]>('/connections', token)
          setConnections(data)
          const firstConnection = data[0]
          if (firstConnection && !selectedConnectionId) {
            setSelectedConnectionId(firstConnection.id)
          }
        }
      } catch (error) {
        console.error('Failed to load connections:', error)
      } finally {
        setLoading(false)
      }
    }
    loadConnections()
  }, [getToken])

  // Load designer data when connection changes
  useEffect(() => {
    const loadDesignerData = async () => {
      if (!selectedConnectionId) {
        setDesignerData(null)
        return
      }

      setDataLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<RoleDesignerData>(
            `/objects/role-designer/data?connection_id=${selectedConnectionId}`,
            token
          )
          setDesignerData(data)
        }
      } catch (error) {
        console.error('Failed to load designer data:', error)
        toast({
          title: 'Error',
          description: 'Failed to load role designer data',
          variant: 'destructive',
        })
      } finally {
        setDataLoading(false)
      }
    }
    loadDesignerData()
  }, [selectedConnectionId, getToken, toast])

  // Load role data when in edit mode
  useEffect(() => {
    const loadRoleData = async () => {
      if (!isEditMode || !selectedConnectionId || !editRoleParam) {
        return
      }

      setEditDataLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<RolePrivilegesResponse>(
            `/objects/roles/${encodeURIComponent(editRoleParam)}/privileges?connection_id=${selectedConnectionId}`,
            token
          )

          // Pre-populate the form
          setRoleName(data.role_name)
          setDescription(data.description || '')
          setInheritFromRoles(data.inherited_roles)
          setPrivileges(data.privileges)
          setAssignToUsers(data.assigned_to_users)
          setAssignToRoles(data.assigned_to_roles)

          // Store originals for diff calculation
          setOriginalPrivileges(data.privileges)
          setOriginalInheritedRoles(data.inherited_roles)
          setOriginalAssignedUsers(data.assigned_to_users)
          setOriginalAssignedRoles(data.assigned_to_roles)
        }
      } catch (error) {
        console.error('Failed to load role data:', error)
        toast({
          title: 'Error',
          description: 'Failed to load role data for editing',
          variant: 'destructive',
        })
      } finally {
        setEditDataLoading(false)
      }
    }
    loadRoleData()
  }, [isEditMode, selectedConnectionId, editRoleParam, getToken, toast])

  // Toggle database expansion
  const toggleDatabase = (dbName: string) => {
    const newExpanded = new Set(expandedDatabases)
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName)
    } else {
      newExpanded.add(dbName)
    }
    setExpandedDatabases(newExpanded)
  }

  // Toggle schema expansion
  const toggleSchema = (schemaKey: string) => {
    const newExpanded = new Set(expandedSchemas)
    if (newExpanded.has(schemaKey)) {
      newExpanded.delete(schemaKey)
    } else {
      newExpanded.add(schemaKey)
    }
    setExpandedSchemas(newExpanded)
  }

  // Check if privilege is selected
  const isPrivilegeSelected = (privilege: string, objectType: string, objectName: string) => {
    return privileges.some(
      p => p.privilege === privilege && p.object_type === objectType && p.object_name === objectName
    )
  }

  // Toggle privilege (add if not exists, remove if exists)
  const togglePrivilege = (privilege: string, objectType: string, objectName: string, isImportedDb?: boolean) => {
    const existingIndex = privileges.findIndex(
      p => p.privilege === privilege && p.object_type === objectType && p.object_name === objectName
    )
    if (existingIndex >= 0) {
      setPrivileges(privileges.filter((_, i) => i !== existingIndex))
    } else {
      const newPriv: PrivilegeSpec = { privilege, object_type: objectType, object_name: objectName }
      if (isImportedDb) {
        newPriv.is_imported_database = true
      }
      setPrivileges([...privileges, newPriv])
    }
  }

  // Remove privilege by index
  const removePrivilege = (index: number) => {
    setPrivileges(privileges.filter((_, i) => i !== index))
  }

  // Toggle role inheritance
  const toggleInheritRole = (roleName: string) => {
    if (inheritFromRoles.includes(roleName)) {
      setInheritFromRoles(inheritFromRoles.filter(r => r !== roleName))
    } else {
      setInheritFromRoles([...inheritFromRoles, roleName])
    }
  }

  // Toggle user assignment
  const toggleUserAssignment = (userName: string) => {
    if (assignToUsers.includes(userName)) {
      setAssignToUsers(assignToUsers.filter(u => u !== userName))
    } else {
      setAssignToUsers([...assignToUsers, userName])
    }
  }

  // Toggle role assignment
  const toggleRoleAssignment = (roleName: string) => {
    if (assignToRoles.includes(roleName)) {
      setAssignToRoles(assignToRoles.filter(r => r !== roleName))
    } else {
      setAssignToRoles([...assignToRoles, roleName])
    }
  }

  // Generate SQL preview
  const generatePreview = async () => {
    if (!selectedConnectionId || !roleName) return

    setPreviewLoading(true)
    try {
      const token = await getToken()
      if (token) {
        const requestBody: Record<string, unknown> = {
          role_name: roleName,
          description,
          inherit_from_roles: inheritFromRoles,
          privileges,
          assign_to_users: assignToUsers,
          assign_to_roles: assignToRoles,
        }

        // Add edit mode fields for diff calculation
        if (isEditMode) {
          requestBody.is_edit_mode = true
          requestBody.original_inherited_roles = originalInheritedRoles
          requestBody.original_privileges = originalPrivileges
          requestBody.original_assigned_users = originalAssignedUsers
          requestBody.original_assigned_roles = originalAssignedRoles
        }

        const response = await api.post<SqlPreviewResponse>(
          `/objects/role-designer/preview?connection_id=${selectedConnectionId}`,
          requestBody,
          token
        )
        setSqlPreview(response)
      }
    } catch (error) {
      console.error('Failed to generate preview:', error)
      toast({
        title: 'Error',
        description: 'Failed to generate SQL preview',
        variant: 'destructive',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  // Helper to compare privileges
  const privilegeKey = (p: PrivilegeSpec) => `${p.privilege}|${p.object_type}|${p.object_name}`

  // Create changeset
  const createChangeset = async () => {
    if (!selectedConnectionId || !roleName || !sqlPreview) return

    setCreating(true)
    try {
      const token = await getToken()
      if (token) {
        // Build changes for the changeset
        const changes = []

        if (isEditMode) {
          // EDIT MODE: Compute diff and generate grant/revoke changes

          // Diff inherited roles
          const originalInheritedSet = new Set(originalInheritedRoles)
          const newInheritedSet = new Set(inheritFromRoles)

          // Roles to grant (new - original)
          for (const parentRole of inheritFromRoles) {
            if (!originalInheritedSet.has(parentRole)) {
              changes.push({
                change_type: 'grant_role',
                object_type: 'role',
                object_name: parentRole,
                details: { grantee: roleName, grantee_type: 'ROLE' },
              })
            }
          }

          // Roles to revoke (original - new)
          for (const parentRole of originalInheritedRoles) {
            if (!newInheritedSet.has(parentRole)) {
              changes.push({
                change_type: 'revoke_role',
                object_type: 'role',
                object_name: parentRole,
                details: { grantee: roleName, grantee_type: 'ROLE' },
              })
            }
          }

          // Diff privileges
          const originalPrivSet = new Set(originalPrivileges.map(privilegeKey))
          const newPrivSet = new Set(privileges.map(privilegeKey))

          // Privileges to grant (new - original)
          for (const priv of privileges) {
            if (!originalPrivSet.has(privilegeKey(priv))) {
              changes.push({
                change_type: 'grant_privilege',
                object_type: 'role',
                object_name: roleName,
                details: {
                  privilege: priv.privilege,
                  on_type: priv.object_type,
                  on_name: priv.object_name,
                  is_imported_database: priv.is_imported_database,
                },
              })
            }
          }

          // Privileges to revoke (original - new)
          for (const priv of originalPrivileges) {
            if (!newPrivSet.has(privilegeKey(priv))) {
              changes.push({
                change_type: 'revoke_privilege',
                object_type: 'role',
                object_name: roleName,
                details: {
                  privilege: priv.privilege,
                  on_type: priv.object_type,
                  on_name: priv.object_name,
                },
              })
            }
          }

          // Diff user assignments
          const originalUserSet = new Set(originalAssignedUsers)
          const newUserSet = new Set(assignToUsers)

          for (const user of assignToUsers) {
            if (!originalUserSet.has(user)) {
              changes.push({
                change_type: 'grant_role',
                object_type: 'role',
                object_name: roleName,
                details: { grantee: user, grantee_type: 'USER' },
              })
            }
          }

          for (const user of originalAssignedUsers) {
            if (!newUserSet.has(user)) {
              changes.push({
                change_type: 'revoke_role',
                object_type: 'role',
                object_name: roleName,
                details: { grantee: user, grantee_type: 'USER' },
              })
            }
          }

          // Diff role assignments
          const originalRoleSet = new Set(originalAssignedRoles)
          const newRoleSet = new Set(assignToRoles)

          for (const role of assignToRoles) {
            if (!originalRoleSet.has(role)) {
              changes.push({
                change_type: 'grant_role',
                object_type: 'role',
                object_name: roleName,
                details: { grantee: role, grantee_type: 'ROLE' },
              })
            }
          }

          for (const role of originalAssignedRoles) {
            if (!newRoleSet.has(role)) {
              changes.push({
                change_type: 'revoke_role',
                object_type: 'role',
                object_name: roleName,
                details: { grantee: role, grantee_type: 'ROLE' },
              })
            }
          }
        } else {
          // CREATE MODE: Generate all grants as new

          // Create role
          changes.push({
            change_type: 'create_role',
            object_type: 'role',
            object_name: roleName,
            details: { comment: description },
          })

          // Grant inherited roles
          for (const parentRole of inheritFromRoles) {
            changes.push({
              change_type: 'grant_role',
              object_type: 'role',
              object_name: parentRole,
              details: { grantee: roleName, grantee_type: 'ROLE' },
            })
          }

          // Grant privileges
          for (const priv of privileges) {
            changes.push({
              change_type: 'grant_privilege',
              object_type: 'role',
              object_name: roleName,
              details: {
                privilege: priv.privilege,
                on_type: priv.object_type,
                on_name: priv.object_name,
                is_imported_database: priv.is_imported_database,
              },
            })
          }

          // Assign to users
          for (const user of assignToUsers) {
            changes.push({
              change_type: 'grant_role',
              object_type: 'role',
              object_name: roleName,
              details: { grantee: user, grantee_type: 'USER' },
            })
          }

          // Assign to roles
          for (const role of assignToRoles) {
            changes.push({
              change_type: 'grant_role',
              object_type: 'role',
              object_name: roleName,
              details: { grantee: role, grantee_type: 'ROLE' },
            })
          }
        }

        if (changes.length === 0) {
          toast({
            title: 'No changes',
            description: 'No changes were made to the role',
          })
          return
        }

        await api.post(
          '/changesets',
          {
            connection_id: selectedConnectionId,
            title: isEditMode ? `Modify role: ${roleName}` : `Create role: ${roleName}`,
            description: sqlPreview.summary,
            changes,
          },
          token
        )

        toast({
          title: 'Success',
          description: 'Changeset created successfully',
        })

        navigate('/changesets')
      }
    } catch (error) {
      console.error('Failed to create changeset:', error)
      toast({
        title: 'Error',
        description: 'Failed to create changeset',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const pageTitle = isEditMode ? `Edit Role: ${editRoleParam}` : 'Role Designer'
  const pageDescription = isEditMode
    ? 'Modify privileges, role inheritance, and assignments'
    : 'Create new roles with visual privilege assignment'

  if (loading || editDataLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">{pageDescription}</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">{pageDescription}</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Connect a platform and run a sync to design roles.
            </p>
            <Button onClick={() => navigate('/connections')}>Add Connection</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground">{pageDescription}</p>
        </div>
        <select
          value={selectedConnectionId || ''}
          onChange={(e) => setSelectedConnectionId(e.target.value || null)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {connections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.name} ({conn.platform})
            </option>
          ))}
        </select>
      </div>

      {dataLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Role configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Role basics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Role Configuration
                </CardTitle>
                <CardDescription>Define the new role's name and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roleName">Role Name</Label>
                  <Input
                    id="roleName"
                    placeholder="e.g., DATA_ANALYST_ROLE"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    disabled={isEditMode}
                    className={isEditMode ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEditMode
                      ? 'Role name cannot be changed. Create a new role if you need a different name.'
                      : 'Use uppercase letters, numbers, and underscores only'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the purpose of this role..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Inherit from roles */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  Inherit from Roles
                </CardTitle>
                <CardDescription>
                  Select existing roles to inherit permissions from (functional role pattern)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designerData?.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No existing roles found</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {designerData?.roles
                      .filter(r => r !== roleName)
                      .map((role) => (
                        <button
                          key={role}
                          onClick={() => toggleInheritRole(role)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                            inheritFromRoles.includes(role)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                        >
                          {inheritFromRoles.includes(role) && <Check className="h-3 w-3" />}
                          {role}
                        </button>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Database privileges */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Privileges
                </CardTitle>
                <CardDescription>
                  Select databases and schemas to grant privileges on
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designerData?.databases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No databases found. Run a sync to see available databases.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {designerData?.databases.map((db) => (
                      <div key={db.name} className="border rounded-lg">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleDatabase(db.name)}
                        >
                          <div className="flex items-center gap-2">
                            {expandedDatabases.has(db.name) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Database className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{db.name}</span>
                            {db.is_imported && (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                                Shared
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {db.is_imported ? (
                              // For imported/shared databases, only show IMPORTED PRIVILEGES option
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  togglePrivilege('IMPORTED PRIVILEGES', 'DATABASE', db.name, true)
                                }}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  isPrivilegeSelected('IMPORTED PRIVILEGES', 'DATABASE', db.name)
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-muted hover:bg-amber-100 hover:text-amber-700'
                                }`}
                              >
                                IMPORTED PRIVILEGES
                              </button>
                            ) : (
                              // For regular databases, show normal privilege buttons
                              SNOWFLAKE_PRIVILEGES.DATABASE.map((priv) => {
                                const selected = isPrivilegeSelected(priv, 'DATABASE', db.name)
                                return (
                                  <button
                                    key={priv}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      togglePrivilege(priv, 'DATABASE', db.name)
                                    }}
                                    className={`text-xs px-2 py-1 rounded transition-colors ${
                                      selected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-muted hover:bg-blue-100 hover:text-blue-700'
                                    }`}
                                  >
                                    {priv}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </div>

                        {expandedDatabases.has(db.name) && db.schemas.length > 0 && (
                          <div className="border-t bg-muted/20 p-2 pl-8 space-y-1">
                            {db.schemas.map((schema) => {
                              const schemaKey = `${db.name}.${schema}`
                              const fullSchemaName = `${db.name}.${schema}`
                              return (
                                <div key={schema}>
                                  <div
                                    className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                                    onClick={() => toggleSchema(schemaKey)}
                                  >
                                    <div className="flex items-center gap-2">
                                      {expandedSchemas.has(schemaKey) ? (
                                        <ChevronDown className="h-3 w-3" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3" />
                                      )}
                                      <span className="text-sm">{schema}</span>
                                    </div>
                                    <div className="flex gap-1">
                                      {['USAGE', 'CREATE TABLE', 'CREATE VIEW'].map((priv) => {
                                        const selected = isPrivilegeSelected(priv, 'SCHEMA', fullSchemaName)
                                        return (
                                          <button
                                            key={priv}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              togglePrivilege(priv, 'SCHEMA', fullSchemaName)
                                            }}
                                            className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                              selected
                                                ? 'bg-green-600 text-white'
                                                : 'bg-background hover:bg-green-100 hover:text-green-700'
                                            }`}
                                          >
                                            {priv}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  {expandedSchemas.has(schemaKey) && (
                                    <div className="ml-6 p-2 text-sm text-muted-foreground">
                                      <div className="flex gap-2 items-center">
                                        <span>All tables:</span>
                                        {['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((priv) => {
                                          const selected = isPrivilegeSelected(priv, 'ALL TABLES IN SCHEMA', fullSchemaName)
                                          return (
                                            <button
                                              key={priv}
                                              onClick={() => togglePrivilege(priv, 'ALL TABLES IN SCHEMA', fullSchemaName)}
                                              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                                selected
                                                  ? 'bg-purple-600 text-white'
                                                  : 'bg-background hover:bg-purple-100 hover:text-purple-700'
                                              }`}
                                            >
                                              {priv}
                                            </button>
                                          )
                                        })}
                                      </div>
                                      <div className="flex gap-2 items-center mt-1">
                                        <span>Future tables:</span>
                                        {['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((priv) => {
                                          const selected = isPrivilegeSelected(priv, 'FUTURE TABLES IN SCHEMA', fullSchemaName)
                                          return (
                                            <button
                                              key={priv}
                                              onClick={() => togglePrivilege(priv, 'FUTURE TABLES IN SCHEMA', fullSchemaName)}
                                              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                                selected
                                                  ? 'bg-orange-600 text-white'
                                                  : 'bg-background hover:bg-orange-100 hover:text-orange-700'
                                              }`}
                                            >
                                              {priv}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assign to users */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Assign to Users
                </CardTitle>
                <CardDescription>Select users who should receive this role</CardDescription>
              </CardHeader>
              <CardContent>
                {designerData?.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users found</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {designerData?.users.map((user) => (
                      <button
                        key={user}
                        onClick={() => toggleUserAssignment(user)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                          assignToUsers.includes(user)
                            ? 'bg-green-600 text-white'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                      >
                        {assignToUsers.includes(user) && <Check className="h-3 w-3" />}
                        {user}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assign to roles (for functional role hierarchy) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Assign to Parent Roles
                </CardTitle>
                <CardDescription>
                  Grant this role to higher-level roles (functional role hierarchy)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designerData?.roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles found</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {designerData?.roles
                      .filter(r => r !== roleName && !inheritFromRoles.includes(r))
                      .map((role) => (
                        <button
                          key={role}
                          onClick={() => toggleRoleAssignment(role)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                            assignToRoles.includes(role)
                              ? 'bg-blue-600 text-white'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                        >
                          {assignToRoles.includes(role) && <Check className="h-3 w-3" />}
                          {role}
                        </button>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right panel - Selected privileges and preview */}
          <div className="space-y-6">
            {/* Selected privileges */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Selected Privileges
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {privileges.length} selected
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {privileges.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Click on privileges in the database tree to add them
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {privileges.map((priv, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                      >
                        <div>
                          <span className="font-medium text-primary">{priv.privilege}</span>
                          <span className="text-muted-foreground"> on </span>
                          <span>{priv.object_type} </span>
                          <span className="font-mono text-xs">{priv.object_name}</span>
                        </div>
                        <button
                          onClick={() => removePrivilege(index)}
                          className="p-1 hover:bg-destructive/20 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role name:</span>
                  <span className="font-medium">{roleName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Inherits from:</span>
                  <span className="font-medium">{inheritFromRoles.length} roles</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Privileges:</span>
                  <span className="font-medium">{privileges.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned to users:</span>
                  <span className="font-medium">{assignToUsers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned to roles:</span>
                  <span className="font-medium">{assignToRoles.length}</span>
                </div>
              </CardContent>
            </Card>

            {/* SQL Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  SQL Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={generatePreview}
                  disabled={!roleName || previewLoading}
                  variant="outline"
                  className="w-full mb-4"
                >
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Code className="h-4 w-4 mr-2" />
                  )}
                  Generate SQL Preview
                </Button>

                {sqlPreview && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{sqlPreview.summary}</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
                      {sqlPreview.statements.join('\n\n')}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create changeset button */}
            <Button
              onClick={createChangeset}
              disabled={!roleName || !sqlPreview || creating}
              className="w-full"
              size="lg"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              {isEditMode ? 'Create Modification Changeset' : 'Create Changeset'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
