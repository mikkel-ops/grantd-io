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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import {
  nodeTypes,
  AddUserModal,
  AddRoleModal,
  PendingChangesPanel,
  CanvasLegend,
  useCanvasData,
  usePendingChanges,
  useDatabaseFocus,
  UserDetails,
  PendingChange,
} from '@/components/canvas'

export default function CanvasPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()

  // Load canvas data
  const {
    loading,
    connectionId,
    initialNodes,
    initialEdges,
  } = useCanvasData()

  // Canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [baseNodes, setBaseNodes] = useState<Node[]>([])
  const [baseEdges, setBaseEdges] = useState<Edge[]>([])

  // Modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Initialize canvas when data loads
  useEffect(() => {
    if (initialNodes.length > 0) {
      console.log('Initializing canvas with', initialNodes.length, 'nodes and', initialEdges.length, 'edges')
      setNodes(initialNodes)
      setEdges(initialEdges)
      setBaseNodes(initialNodes)
      setBaseEdges(initialEdges)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Pending changes management
  const {
    pendingChanges,
    addGrantRole,
    addRevokeRole,
    addCreateUser,
    addCreateRole,
    removePendingChange,
    clearAllChanges,
  } = usePendingChanges(nodes, setNodes, edges, setEdges)

  // Database focus - shows role-to-database connections when clicking a role
  const { focusedRole, focusOnRole, clearFocus } = useDatabaseFocus(
    baseNodes,
    baseEdges,
    setNodes,
    setEdges
  )

  // Handle new connections (user -> role grants)
  const onConnect = useCallback(
    (params: FlowConnection) => {
      if (!params.source?.startsWith('user-') || !params.target?.startsWith('role-')) {
        return
      }

      const userName = params.source.replace('user-', '')
      const roleName = params.target.replace('role-', '')

      // Add visual edge
      setEdges(eds =>
        addEdge(
          {
            ...params,
            id: `pending-${userName}-${roleName}`,
            animated: true,
            style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
          },
          eds
        )
      )

      addGrantRole(userName, roleName)
    },
    [setEdges, addGrantRole]
  )

  // Handle node clicks
  const onNodeClick = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (node.id === 'add-user-button') {
        setShowAddUserModal(true)
      } else if (node.id === 'add-role-button') {
        setShowAddRoleModal(true)
      } else if (node.type === 'role' && connectionId) {
        // Show database access for any role when clicked
        const token = await getToken()
        if (token) {
          focusOnRole(node.data.label as string, connectionId, token)
        }
      }
    },
    [focusOnRole, connectionId, getToken]
  )

  // Handle edge clicks (for revokes)
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      // Skip pending/role-to-role edges
      if (edge.id.startsWith('pending-') || edge.id.startsWith('role-edge-')) {
        return
      }

      // Clicking revoked edge restores it
      if (edge.id.startsWith('revoke-')) {
        const changeId = edge.id.replace('revoke-', '')
        removePendingChange(changeId, 'revoke_role')
        return
      }

      // Extract user and role from edge
      const { source, target } = edge
      if (!source?.startsWith('user-') || !target?.startsWith('role-')) {
        return
      }

      const userName = source.replace('user-', '')
      const roleName = target.replace('role-', '')

      addRevokeRole(userName, roleName, edge.id)
    },
    [removePendingChange, addRevokeRole]
  )

  // Handle user creation
  const handleUserCreated = useCallback(
    (details: UserDetails) => {
      addCreateUser(details)
      setShowAddUserModal(false)
    },
    [addCreateUser]
  )

  // Handle role creation
  const handleRoleCreated = useCallback(
    (roleName: string, inheritedRoles: string[], assignedUsers: string[]) => {
      addCreateRole(roleName, inheritedRoles, assignedUsers)
      setShowAddRoleModal(false)
    },
    [addCreateRole]
  )

  // Submit changeset
  const submitChangeset = useCallback(async () => {
    if (!connectionId || pendingChanges.length === 0) return

    setSubmitting(true)
    try {
      const token = await getToken()

      const changes = pendingChanges.map(change => {
        if (change.type === 'create_user' && change.userDetails) {
          const d = change.userDetails
          return {
            change_type: 'create_user',
            object_type: 'user',
            object_name: d.userName,
            details: {
              login_name: d.loginName || d.userName,
              email: d.email || '',
              password: d.password || '',
              first_name: d.firstName || '',
              last_name: d.lastName || '',
              display_name: d.displayName || '',
              comment: d.comment || '',
              default_namespace: d.defaultNamespace || '',
              must_change_password: d.mustChangePassword,
            },
          }
        } else if (change.type === 'create_role') {
          return {
            change_type: 'create_role',
            object_type: 'role',
            object_name: change.roleName,
            details: {},
          }
        } else {
          return {
            change_type: change.type === 'grant_role' ? 'grant' : 'revoke',
            object_type: 'role_assignment',
            object_name: `${change.userName} -> ${change.roleName}`,
            details: {
              user_name: change.userName,
              role_name: change.roleName,
            },
          }
        }
      })

      const title = buildChangesetTitle(pendingChanges)

      await api.post(
        '/changesets',
        {
          connection_id: connectionId,
          title,
          description: 'Changes from Access Canvas',
          changes,
        },
        token || undefined
      )

      clearAllChanges()
      navigate('/changesets')
    } catch (error) {
      console.error('Failed to create changeset:', error)
    } finally {
      setSubmitting(false)
    }
  }, [connectionId, pendingChanges, getToken, navigate, clearAllChanges])

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

      <CanvasLegend focusedRole={focusedRole} onClearFocus={clearFocus} />

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        <div
          className={`border rounded-lg overflow-hidden bg-slate-50 ${
            pendingChanges.length > 0 ? 'flex-1' : 'w-full'
          }`}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
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

        <PendingChangesPanel
          changes={pendingChanges}
          onRemoveChange={removePendingChange}
          onSubmit={submitChangeset}
          onClearAll={clearAllChanges}
          submitting={submitting}
        />
      </div>

      {showAddUserModal && connectionId && (
        <AddUserModal
          connectionId={connectionId}
          onClose={() => setShowAddUserModal(false)}
          onUserCreated={handleUserCreated}
        />
      )}

      {showAddRoleModal && connectionId && (
        <AddRoleModal
          connectionId={connectionId}
          onClose={() => setShowAddRoleModal(false)}
          onRoleCreated={handleRoleCreated}
        />
      )}
    </div>
  )
}

// Helper to build changeset title
function buildChangesetTitle(changes: PendingChange[]): string {
  const createUserCount = changes.filter(c => c.type === 'create_user').length
  const createRoleCount = changes.filter(c => c.type === 'create_role').length
  const grantCount = changes.filter(c => c.type === 'grant_role').length
  const revokeCount = changes.filter(c => c.type === 'revoke_role').length

  const parts = []
  if (createUserCount > 0) parts.push(`${createUserCount} new user${createUserCount > 1 ? 's' : ''}`)
  if (createRoleCount > 0) parts.push(`${createRoleCount} new role${createRoleCount > 1 ? 's' : ''}`)
  if (grantCount > 0) parts.push(`${grantCount} grant${grantCount > 1 ? 's' : ''}`)
  if (revokeCount > 0) parts.push(`${revokeCount} revoke${revokeCount > 1 ? 's' : ''}`)

  return `Access Canvas changes (${parts.join(', ')})`
}
