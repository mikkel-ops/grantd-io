import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2, Search, Users, Key, Database, ChevronRight, ChevronDown, Wand2, Pencil, Layers, Folder } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Link } from 'react-router-dom'

interface Connection {
  id: string
  name: string
  platform: string
  connection_config?: {
    role?: string
    username?: string
  }
}

interface PlatformRole {
  id: string
  connection_id: string
  name: string
  description: string | null
  is_system: boolean
  role_type: RoleType | null  // Comes from API now
  member_count: number
  grant_count: number
  platform_data: Record<string, unknown>
  synced_at: string
}

interface RoleAssignment {
  id: string
  connection_id: string
  role_name: string
  assignee_type: string
  assignee_name: string
  assigned_by: string | null
  synced_at: string
}

// New interfaces for role details
type RoleType = 'functional' | 'business' | 'hybrid'

interface RoleHierarchyNode {
  name: string
  is_system: boolean
}

interface RoleAccessSummaryCompact {
  databases: string[]
  total_databases: number
  total_schemas: number
  total_privileges: number
}

interface SchemaAccessDetail {
  name: string
  table_count: number
  view_count: number
  privileges: string[]
}

interface DatabaseAccessDetail {
  name: string
  privileges: string[]
  schemas: SchemaAccessDetail[]
}

interface RoleDetailResponse {
  role_name: string
  role_type: RoleType
  role_type_reason: string
  parent_roles: RoleHierarchyNode[]
  child_roles: RoleHierarchyNode[]
  access_summary: RoleAccessSummaryCompact
  access_map: DatabaseAccessDetail[]
  user_assignment_count: number
  role_assignment_count: number
}

// Helper Components

function RoleTypeBadge({ type }: { type: RoleType }) {
  const config = {
    functional: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      label: 'Functional',
      Icon: Database,
    },
    business: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: 'Business',
      Icon: Users,
    },
    hybrid: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      label: 'Hybrid',
      Icon: Layers,
    },
  }
  const { bg, text, label, Icon } = config[type]

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${bg} ${text}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function DatabaseChips({ databases, total }: { databases: string[], total: number }) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">No database access</span>
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {databases.map((db) => (
        <span
          key={db}
          className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
        >
          <Database className="h-3 w-3" />
          {db}
        </span>
      ))}
      {total > databases.length && (
        <span className="text-xs text-muted-foreground">
          +{total - databases.length} more
        </span>
      )}
    </div>
  )
}

function RoleHierarchyTree({
  parentRoles,
  childRoles,
  currentRole
}: {
  parentRoles: RoleHierarchyNode[]
  childRoles: RoleHierarchyNode[]
  currentRole: string
}) {
  return (
    <div className="space-y-3">
      {/* Parent roles (this role inherits from) */}
      {parentRoles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Inherits From</p>
          <div className="space-y-1 ml-2">
            {parentRoles.map((role) => (
              <div
                key={role.name}
                className={`flex items-center gap-2 p-2 rounded text-sm ${
                  role.is_system ? 'bg-amber-50' : 'bg-muted/50'
                }`}
              >
                <div className="w-4 border-t border-l h-3 border-muted-foreground/30" />
                <Shield className={`h-3 w-3 ${role.is_system ? 'text-amber-600' : 'text-primary'}`} />
                <span>{role.name}</span>
                {role.is_system && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded">System</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current role */}
      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded border border-primary/20">
        <Shield className="h-4 w-4 text-primary" />
        <span className="font-medium">{currentRole}</span>
        <span className="text-xs text-muted-foreground">(current)</span>
      </div>

      {/* Child roles (roles that inherit from this) */}
      {childRoles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Inherited By</p>
          <div className="space-y-1 ml-2">
            {childRoles.map((role) => (
              <div
                key={role.name}
                className={`flex items-center gap-2 p-2 rounded text-sm ${
                  role.is_system ? 'bg-amber-50' : 'bg-muted/50'
                }`}
              >
                <div className="w-4 border-t border-l h-3 border-muted-foreground/30 rotate-180" />
                <Shield className={`h-3 w-3 ${role.is_system ? 'text-amber-600' : 'text-muted-foreground'}`} />
                <span>{role.name}</span>
                {role.is_system && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded">System</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {parentRoles.length === 0 && childRoles.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No role hierarchy relationships
        </p>
      )}
    </div>
  )
}

function AccessMapView({ accessMap }: { accessMap: DatabaseAccessDetail[] }) {
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())

  const toggleDb = (dbName: string) => {
    setExpandedDbs(prev => {
      const next = new Set(prev)
      if (next.has(dbName)) {
        next.delete(dbName)
      } else {
        next.add(dbName)
      }
      return next
    })
  }

  if (accessMap.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        No direct database access grants
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {accessMap.map((db) => (
        <div key={db.name} className="border rounded bg-background">
          <button
            onClick={() => toggleDb(db.name)}
            className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left text-sm"
          >
            {expandedDbs.has(db.name) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Database className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{db.name}</span>
            <span className="text-xs text-muted-foreground">
              {db.schemas.length} schema{db.schemas.length !== 1 ? 's' : ''}
            </span>
            {db.privileges.length > 0 && (
              <div className="flex gap-1 ml-auto">
                {db.privileges.map((priv) => (
                  <span key={priv} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {priv}
                  </span>
                ))}
              </div>
            )}
          </button>

          {expandedDbs.has(db.name) && db.schemas.length > 0 && (
            <div className="border-t pl-6 py-2 space-y-1">
              {db.schemas.map((schema) => (
                <div key={schema.name} className="flex items-center gap-2 text-sm p-1">
                  <Folder className="h-3 w-3 text-amber-600" />
                  <span>{schema.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {schema.table_count > 0 && `${schema.table_count} tables`}
                    {schema.table_count > 0 && schema.view_count > 0 && ', '}
                    {schema.view_count > 0 && `${schema.view_count} views`}
                  </span>
                  {schema.privileges.length > 0 && (
                    <div className="flex gap-1 ml-auto">
                      {schema.privileges.map((priv) => (
                        <span key={priv} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          {priv}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function RolesPage() {
  const { getToken } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [roles, setRoles] = useState<PlatformRole[]>([])
  const [loading, setLoading] = useState(true)
  const [rolesLoading, setRolesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [includeSystem, setIncludeSystem] = useState(false)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [roleAssignments, setRoleAssignments] = useState<Record<string, RoleAssignment[]>>({})
  const [roleDetails, setRoleDetails] = useState<Record<string, RoleDetailResponse>>({})
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<'access' | 'hierarchy' | 'assignments'>('access')

  // Get the selected connection to access service role info
  const selectedConnection = connections.find(c => c.id === selectedConnectionId)
  const serviceRole = selectedConnection?.connection_config?.role || 'GRANTD_READONLY'

  // Filter roles to exclude service role
  const filteredRoles = roles.filter(role =>
    role.name.toUpperCase() !== serviceRole.toUpperCase()
  )

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const token = await getToken()
        if (token) {
          const data = await api.get<Connection[]>('/connections', token)
          setConnections(data)
          // Auto-select first connection if available
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

  // Load roles when connection changes
  useEffect(() => {
    const loadRoles = async () => {
      if (!selectedConnectionId) {
        setRoles([])
        return
      }

      setRolesLoading(true)
      try {
        const token = await getToken()
        if (token) {
          const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
          const systemParam = `&include_system=${includeSystem}`
          const data = await api.get<PlatformRole[]>(
            `/objects/roles?connection_id=${selectedConnectionId}${searchParam}${systemParam}`,
            token
          )
          setRoles(data)
        }
      } catch (error) {
        console.error('Failed to load roles:', error)
        setRoles([])
      } finally {
        setRolesLoading(false)
      }
    }
    loadRoles()
  }, [selectedConnectionId, searchQuery, includeSystem, getToken])

  // Load role details when expanding a role
  const handleRoleExpand = async (roleName: string) => {
    if (expandedRole === roleName) {
      setExpandedRole(null)
      return
    }

    setExpandedRole(roleName)
    setExpandedSection('access') // Default to access tab

    // Check if we already have the details cached
    if (roleDetails[roleName]) {
      return
    }

    setLoadingDetails(roleName)
    try {
      const token = await getToken()
      if (token && selectedConnectionId) {
        // Load both assignments and details in parallel
        const [assignmentsData, detailsData] = await Promise.all([
          api.get<RoleAssignment[]>(
            `/objects/roles/${encodeURIComponent(roleName)}/assignments?connection_id=${selectedConnectionId}`,
            token
          ),
          api.get<RoleDetailResponse>(
            `/objects/roles/${encodeURIComponent(roleName)}/details?connection_id=${selectedConnectionId}`,
            token
          ),
        ])

        setRoleAssignments(prev => ({ ...prev, [roleName]: assignmentsData }))
        setRoleDetails(prev => ({ ...prev, [roleName]: detailsData }))
      }
    } catch (error) {
      console.error('Failed to load role details:', error)
    } finally {
      setLoadingDetails(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="text-muted-foreground">
            View and manage roles across your connected platforms
          </p>
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
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="text-muted-foreground">
            View and manage roles across your connected platforms
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-4">
              Connect a platform and run a sync to see your roles here.
            </p>
            <Link
              to="/connections"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add Connection
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="text-muted-foreground">
            View and manage roles across your connected platforms
          </p>
        </div>
        <Link
          to="/roles/designer"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Wand2 className="h-4 w-4" />
          Design New Role
        </Link>
      </div>

      {/* Connection selector and search */}
      <div className="flex flex-wrap gap-4">
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSystem}
            onChange={(e) => setIncludeSystem(e.target.checked)}
            className="rounded border-input"
          />
          Include system roles
        </label>
      </div>

      {/* Roles list */}
      {rolesLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filteredRoles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No roles synced</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Run a sync on your connection to see roles here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Platform Roles
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {filteredRoles.length} role{filteredRoles.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredRoles.map((role) => {
                const details = roleDetails[role.name]
                const isExpanded = expandedRole === role.name

                return (
                  <div key={role.id}>
                    <div
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleRoleExpand(role.name)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${role.is_system ? 'bg-amber-100' : 'bg-primary/10'}`}>
                          <Shield className={`h-5 w-5 ${role.is_system ? 'text-amber-600' : 'text-primary'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{role.name}</p>
                            {role.is_system && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                                System
                              </span>
                            )}
                            {/* Role Type Badge - show from role data (available immediately after sync) */}
                            {role.role_type && <RoleTypeBadge type={role.role_type} />}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {role.description || 'No description'}
                          </p>
                          {/* Database chips - show from cached details */}
                          {details && (
                            <div className="mt-1">
                              <DatabaseChips
                                databases={details.access_summary.databases}
                                total={details.access_summary.total_databases}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center text-muted-foreground">
                          <Users className="h-4 w-4 mr-1" />
                          {role.member_count} members
                        </span>
                        <span className="flex items-center text-muted-foreground">
                          <Key className="h-4 w-4 mr-1" />
                          {role.grant_count} grants
                        </span>
                        <Link
                          to={`/roles/designer?connection_id=${selectedConnectionId}&edit_role=${encodeURIComponent(role.name)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Link>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded section with tabs */}
                    {isExpanded && (
                      <div className="ml-12 mt-2 p-3 bg-muted/30 rounded-lg">
                        {loadingDetails === role.name ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : details ? (
                          <div className="space-y-4">
                            {/* Tab buttons */}
                            <div className="flex gap-2 border-b pb-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedSection('access') }}
                                className={`px-3 py-1 text-sm rounded-t ${
                                  expandedSection === 'access'
                                    ? 'bg-background border border-b-0 font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Database className="h-3 w-3 inline mr-1" />
                                Access ({details.access_summary.total_databases} DBs)
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedSection('hierarchy') }}
                                className={`px-3 py-1 text-sm rounded-t ${
                                  expandedSection === 'hierarchy'
                                    ? 'bg-background border border-b-0 font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Layers className="h-3 w-3 inline mr-1" />
                                Hierarchy ({details.parent_roles.length + details.child_roles.length})
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedSection('assignments') }}
                                className={`px-3 py-1 text-sm rounded-t ${
                                  expandedSection === 'assignments'
                                    ? 'bg-background border border-b-0 font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Users className="h-3 w-3 inline mr-1" />
                                Assignments ({roleAssignments[role.name]?.length || 0})
                              </button>
                            </div>

                            {/* Tab content */}
                            {expandedSection === 'access' && (
                              <AccessMapView accessMap={details.access_map} />
                            )}

                            {expandedSection === 'hierarchy' && (
                              <RoleHierarchyTree
                                parentRoles={details.parent_roles}
                                childRoles={details.child_roles}
                                currentRole={role.name}
                              />
                            )}

                            {expandedSection === 'assignments' && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium mb-2">Role Assignments:</p>
                                {roleAssignments[role.name]?.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No assignments found</p>
                                ) : (
                                  roleAssignments[role.name]?.map((assignment) => (
                                    <div
                                      key={assignment.id}
                                      className="flex items-center justify-between text-sm p-2 bg-background rounded"
                                    >
                                      <span className="flex items-center gap-2">
                                        {assignment.assignee_type === 'USER' ? (
                                          <Users className="h-3 w-3" />
                                        ) : (
                                          <Shield className="h-3 w-3" />
                                        )}
                                        {assignment.assignee_name}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {assignment.assignee_type}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {/* Role type explanation */}
                            <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                              <span className="font-medium">Role type: </span>
                              {details.role_type_reason}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Failed to load details</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
