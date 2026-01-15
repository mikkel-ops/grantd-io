import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Loader2, Search, Users, Key, Database, ChevronRight, Wand2, Pencil } from 'lucide-react'
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
  const [loadingAssignments, setLoadingAssignments] = useState<string | null>(null)

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

  // Load role assignments when expanding a role
  const handleRoleExpand = async (roleName: string) => {
    if (expandedRole === roleName) {
      setExpandedRole(null)
      return
    }

    setExpandedRole(roleName)

    // Check if we already have the assignments cached
    if (roleAssignments[roleName]) {
      return
    }

    setLoadingAssignments(roleName)
    try {
      const token = await getToken()
      if (token && selectedConnectionId) {
        const data = await api.get<RoleAssignment[]>(
          `/objects/roles/${encodeURIComponent(roleName)}/assignments?connection_id=${selectedConnectionId}`,
          token
        )
        setRoleAssignments(prev => ({ ...prev, [roleName]: data }))
      }
    } catch (error) {
      console.error('Failed to load role assignments:', error)
    } finally {
      setLoadingAssignments(null)
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
              {filteredRoles.map((role) => (
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{role.name}</p>
                          {role.is_system && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                              System
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {role.description || 'No description'}
                        </p>
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
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedRole === role.name ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded role assignments */}
                  {expandedRole === role.name && (
                    <div className="ml-12 mt-2 p-3 bg-muted/30 rounded-lg">
                      {loadingAssignments === role.name ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : roleAssignments[role.name]?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No assignments found</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-medium mb-2">Role Assignments:</p>
                          {roleAssignments[role.name]?.map((assignment) => (
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
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
