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
  Connection,
  BackgroundVariant,
  NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { User, Shield, Database, Loader2 } from 'lucide-react'

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

interface Connection {
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
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)

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
        const connections = await api.get<Connection[]>('/connections', token)
        if (connections.length === 0) {
          console.log('No connections found')
          setLoading(false)
          return
        }

        const connectionId = connections[0].id

        // Load users, roles, and assignments in parallel
        const [users, roles, assignments] = await Promise.all([
          api.get<PlatformUser[]>(`/objects/users?connection_id=${connectionId}`, token),
          api.get<PlatformRole[]>(`/objects/roles?connection_id=${connectionId}`, token),
          api.get<RoleAssignment[]>(`/objects/role-assignments?connection_id=${connectionId}`, token),
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
    (params: Connection) => {
      // When user draws a connection, add it as an edge
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#3b82f6' } }, eds))

      // TODO: In the future, this would trigger an API call to create the role assignment
      console.log('New connection:', params)
    },
    [setEdges]
  )

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

      <div className="h-[calc(100vh-220px)] border rounded-lg overflow-hidden bg-slate-50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  )
}
