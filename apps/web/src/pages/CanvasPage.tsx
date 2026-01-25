import { useCallback, useState, useEffect } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection as FlowConnection,
  BackgroundVariant,
  NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { User, Shield, Database, Loader2, Plus, Minus, Trash2, FileText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'

// Pending change type
interface PendingChange {
  id: string
  type: 'grant_role' | 'revoke_role'
  userName: string
  roleName: string
}

// Custom node for Users
function UserNode({ data }: { data: { label: string; email?: string } }) {
  return (
    <div className="px-4 py-3 shadow-md rounded-lg bg-white border-2 border-blue-400 min-w-[150px]">
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-blue-100 p-1.5">
          <User className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <div className="text-sm font-medium">{data.label}</div>
          {data.email && (
            <div className="text-xs text-gray-500">{data.email}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Custom node for Roles
function RoleNode({ data }: { data: { label: string; type?: string; isSystem?: boolean } }) {
  const getBorderColor = () => {
    if (data.type === 'functional') return 'border-purple-400'
    if (data.type === 'business') return 'border-green-400'
    if (data.type === 'hybrid') return 'border-amber-400'
    return 'border-gray-400'
  }

  const getBgColor = () => {
    if (data.type === 'functional') return 'bg-purple-100'
    if (data.type === 'business') return 'bg-green-100'
    if (data.type === 'hybrid') return 'bg-amber-100'
    return 'bg-gray-100'
  }

  const getIconColor = () => {
    if (data.type === 'functional') return 'text-purple-600'
    if (data.type === 'business') return 'text-green-600'
    if (data.type === 'hybrid') return 'text-amber-600'
    return 'text-gray-600'
  }

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg bg-white border-2 ${getBorderColor()} min-w-[150px]`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-gray-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-gray-500" />
      <div className="flex items-center gap-2">
        <div className={`rounded-full ${getBgColor()} p-1.5`}>
          <Shield className={`h-4 w-4 ${getIconColor()}`} />
        </div>
        <div>
          <div className="text-sm font-medium">{data.label}</div>
          {data.type && (
            <div className="text-xs text-gray-500 capitalize">{data.type}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Custom node for Databases
function DatabaseNode({ data }: { data: { label: string } }) {
  return (
    <div className="px-4 py-3 shadow-md rounded-lg bg-white border-2 border-cyan-400 min-w-[150px]">
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-cyan-500" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-cyan-100 p-1.5">
          <Database className="h-4 w-4 text-cyan-600" />
        </div>
        <div>
          <div className="text-sm font-medium">{data.label}</div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  user: UserNode,
  role: RoleNode,
  database: DatabaseNode,
}

interface ApiConnection {
  id: string
  name: string
}

interface PlatformUser {
  id: string
  name: string
  email: string | null
}

interface PlatformRole {
  id: string
  name: string
  role_type: string | null
  is_system: boolean
}

interface RoleAssignment {
  role_name: string
  assignee_type: string
  assignee_name: string
}

export default function CanvasPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Load data and create nodes/edges
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken()
        if (!token) {
          console.log('No token available')
          setLoading(false)
          return
        }

        // First get the connections to find the connection_id
        const connections = await api.get<ApiConnection[]>('/connections', token)
        if (connections.length === 0) {
          console.log('No connections found')
          setLoading(false)
          return
        }

        const connId = connections[0].id
        setConnectionId(connId)

        // Load users, roles, and assignments in parallel
        const [users, roles, assignments] = await Promise.all([
          api.get<PlatformUser[]>(`/objects/users?connection_id=${connId}`, token),
          api.get<PlatformRole[]>(`/objects/roles?connection_id=${connId}`, token),
          api.get<RoleAssignment[]>(`/objects/role-assignments?connection_id=${connId}`, token),
        ])

        // Filter out system roles
        const nonSystemRoles = roles.filter(r => !r.is_system)

        // Separate business and functional roles
        const businessRoles = nonSystemRoles.filter(r => r.role_type === 'business' || r.role_type === 'hybrid' || !r.role_type)
        const functionalRoles = nonSystemRoles.filter(r => r.role_type === 'functional')


        // Create user nodes (left column - x: 50)
        const userNodes: Node[] = users.map((user, index) => ({
          id: `user-${user.name}`,
          type: 'user',
          position: { x: 50, y: 50 + index * 80 },
          data: { label: user.name, email: user.email },
        }))

        // Create business role nodes (middle column - x: 350)
        const businessRoleNodes: Node[] = businessRoles.map((role, index) => ({
          id: `role-${role.name}`,
          type: 'role',
          position: { x: 350, y: 50 + index * 80 },
          data: { label: role.name, type: role.role_type || 'business', isSystem: role.is_system },
        }))

        // Create functional role nodes (right column - x: 650)
        const functionalRoleNodes: Node[] = functionalRoles.map((role, index) => ({
          id: `role-${role.name}`,
          type: 'role',
          position: { x: 650, y: 50 + index * 80 },
          data: { label: role.name, type: role.role_type, isSystem: role.is_system },
        }))

        const allRoleNodes = [...businessRoleNodes, ...functionalRoleNodes]

        // Create edges from user to role assignments
        const assignmentEdges: Edge[] = assignments
          .filter(a => a.assignee_type.toUpperCase() === 'USER')
          .map((assignment, index) => ({
            id: `edge-${index}`,
            source: `user-${assignment.assignee_name}`,
            target: `role-${assignment.role_name}`,
            animated: true,
            style: { stroke: '#3b82f6' },
          }))
          .filter(edge => {
            // Only include edges where both source and target exist (excludes system roles)
            const sourceExists = userNodes.some(n => n.id === edge.source)
            const targetExists = allRoleNodes.some(n => n.id === edge.target)
            return sourceExists && targetExists
          })

        // Create edges for role-to-role assignments (business role inherits from functional)
        const roleToRoleEdges: Edge[] = assignments
          .filter(a => a.assignee_type.toUpperCase() === 'ROLE')
          .map((assignment, index) => ({
            id: `role-edge-${index}`,
            source: `role-${assignment.role_name}`,
            target: `role-${assignment.assignee_name}`,
            style: { stroke: '#6b7280', strokeDasharray: '5,5' },
          }))
          .filter(edge => {
            const sourceExists = allRoleNodes.some(n => n.id === edge.source)
            const targetExists = allRoleNodes.some(n => n.id === edge.target)
            return sourceExists && targetExists
          })

        setNodes([...userNodes, ...allRoleNodes])
        setEdges([...assignmentEdges, ...roleToRoleEdges])
      } catch (error) {
        console.error('Failed to load canvas data:', error)
        // Show empty state on error
        setNodes([])
        setEdges([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [getToken, setNodes, setEdges])

  const onConnect = useCallback(
    (params: FlowConnection) => {
      // Only allow user -> role connections
      if (!params.source?.startsWith('user-') || !params.target?.startsWith('role-')) {
        return
      }

      const userName = params.source.replace('user-', '')
      const roleName = params.target.replace('role-', '')

      // Add visual edge with pending style (dashed, green)
      setEdges((eds) => addEdge({
        ...params,
        id: `pending-${userName}-${roleName}`,
        animated: true,
        style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
      }, eds))

      // Add to pending changes
      setPendingChanges((prev) => [
        ...prev,
        {
          id: `${userName}-${roleName}`,
          type: 'grant_role',
          userName,
          roleName,
        },
      ])
    },
    [setEdges]
  )

  const removePendingChange = useCallback((changeId: string, changeType: 'grant_role' | 'revoke_role') => {
    setPendingChanges((prev) => prev.filter((c) => c.id !== changeId))

    if (changeType === 'grant_role') {
      // Remove the pending grant edge
      setEdges((eds) => eds.filter((e) => !e.id.includes(changeId)))
    } else {
      // Restore the original edge style for revoke cancellation
      setEdges((eds) => eds.map((e) => {
        if (e.id === `revoke-${changeId}`) {
          // Find the original edge and restore it
          const [userName, roleName] = changeId.split('-')
          return {
            ...e,
            id: `edge-restored-${changeId}`,
            style: { stroke: '#3b82f6' },
            animated: true,
          }
        }
        return e
      }))
    }
  }, [setEdges])

  // Handle clicking on existing edges to mark/unmark them for revocation
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    // Don't handle pending grant edges or role-to-role edges
    if (edge.id.startsWith('pending-') || edge.id.startsWith('role-edge-')) {
      return
    }

    // If clicking on a revoked edge, restore it
    if (edge.id.startsWith('revoke-')) {
      const changeId = edge.id.replace('revoke-', '')

      // Remove from pending changes
      setPendingChanges((prev) => prev.filter((c) => c.id !== changeId))

      // Restore the edge to original blue style
      setEdges((eds) => eds.map((e) => {
        if (e.id === edge.id) {
          return {
            ...e,
            id: `edge-restored-${changeId}`,
            style: { stroke: '#3b82f6' },
            animated: true,
          }
        }
        return e
      }))
      return
    }

    // Extract user and role names from the edge
    const sourceId = edge.source
    const targetId = edge.target

    if (!sourceId?.startsWith('user-') || !targetId?.startsWith('role-')) {
      return
    }

    const userName = sourceId.replace('user-', '')
    const roleName = targetId.replace('role-', '')
    const changeId = `${userName}-${roleName}`

    // Check if this revoke is already pending
    if (pendingChanges.some(c => c.id === changeId && c.type === 'revoke_role')) {
      return
    }

    // Update the edge to show it's marked for removal (red dashed line)
    setEdges((eds) => eds.map((e) => {
      if (e.id === edge.id) {
        return {
          ...e,
          id: `revoke-${changeId}`,
          style: { stroke: '#ef4444', strokeDasharray: '5,5', strokeWidth: 2 },
          animated: true,
        }
      }
      return e
    }))

    // Add to pending changes as revoke
    setPendingChanges((prev) => [
      ...prev,
      {
        id: changeId,
        type: 'revoke_role',
        userName,
        roleName,
      },
    ])
  }, [setEdges, pendingChanges])

  const submitChangeset = async () => {
    if (!connectionId || pendingChanges.length === 0) return

    setSubmitting(true)
    try {
      const token = await getToken()

      // Create changeset with all pending changes (grants and revokes)
      const changes = pendingChanges.map((change) => ({
        change_type: change.type === 'grant_role' ? 'grant' : 'revoke',
        object_type: 'role_assignment',
        object_name: `${change.userName} -> ${change.roleName}`,
        details: {
          user_name: change.userName,
          role_name: change.roleName,
        },
      }))

      const grantCount = pendingChanges.filter(c => c.type === 'grant_role').length
      const revokeCount = pendingChanges.filter(c => c.type === 'revoke_role').length

      let title = ''
      if (grantCount > 0 && revokeCount > 0) {
        title = `Role changes (${grantCount} grants, ${revokeCount} revokes)`
      } else if (grantCount > 0) {
        title = `Grant roles to users (${grantCount} changes)`
      } else {
        title = `Revoke roles from users (${revokeCount} changes)`
      }

      await api.post('/changesets', {
        connection_id: connectionId,
        title,
        description: `Role assignments modified from Access Canvas`,
        changes,
      }, token || undefined)

      // Clear pending changes and navigate to changesets
      setPendingChanges([])
      navigate('/changesets')
    } catch (error) {
      console.error('Failed to create changeset:', error)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Access Canvas</h1>
        <p className="text-muted-foreground">
          Visualize and manage role assignments. Drag connections between users and roles.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-400" />
          <span>Users</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-400" />
          <span>Functional Roles</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span>Business Roles</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <span>Hybrid Roles</span>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Canvas */}
        <div className={`border rounded-lg overflow-hidden bg-slate-50 ${pendingChanges.length > 0 ? 'flex-1' : 'w-full'}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        </div>

        {/* Pending Changes Panel */}
        {pendingChanges.length > 0 && (
          <Card className="w-80 flex-shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pending Changes
                <span className="ml-auto bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
                  {pendingChanges.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingChanges.map((change) => {
                const isRevoke = change.type === 'revoke_role'
                return (
                  <div
                    key={change.id}
                    className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                      isRevoke
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-green-50 border border-green-200'
                    }`}
                  >
                    {isRevoke ? (
                      <Minus className="h-4 w-4 text-red-600 flex-shrink-0" />
                    ) : (
                      <Plus className="h-4 w-4 text-green-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium truncate">{change.userName}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">{change.roleName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isRevoke ? 'Revoke role' : 'Grant role'}
                      </div>
                    </div>
                    <button
                      onClick={() => removePendingChange(change.id, change.type)}
                      className={`p-1 rounded ${
                        isRevoke
                          ? 'hover:bg-red-100 text-red-600'
                          : 'hover:bg-green-100 text-green-600'
                      }`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}

              <div className="pt-3 border-t space-y-2">
                <Button
                  onClick={submitChangeset}
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Create Changeset
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Restore revoked edges to their original style and remove pending grants
                    setEdges((eds) => {
                      const filtered = eds.filter((e) => !e.id.startsWith('pending-'))
                      return filtered.map((e) => {
                        if (e.id.startsWith('revoke-')) {
                          return {
                            ...e,
                            id: `edge-restored-${e.id.replace('revoke-', '')}`,
                            style: { stroke: '#3b82f6' },
                            animated: true,
                          }
                        }
                        return e
                      })
                    })
                    setPendingChanges([])
                  }}
                  className="w-full"
                >
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
