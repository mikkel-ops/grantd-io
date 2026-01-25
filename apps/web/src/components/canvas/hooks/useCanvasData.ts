import { useState, useEffect } from 'react'
import { Node, Edge } from '@xyflow/react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

// API response types
export interface ApiConnection {
  id: string
  name: string
}

export interface PlatformUser {
  id: string
  name: string
  email: string | null
}

export interface PlatformRole {
  id: string
  name: string
  role_type: string | null
  is_system: boolean
}

export interface RoleAssignment {
  role_name: string
  assignee_type: string
  assignee_name: string
}

export interface PlatformGrant {
  id: string
  privilege: string
  object_type: string
  object_name: string | null
  object_database: string | null
  object_schema: string | null
  grantee_type: string
  grantee_name: string
}

export interface DatabaseAccess {
  database: string
  schemaCount: number
  privileges: string[]
}

export interface PlatformDatabase {
  name: string
  schema_count: number
  is_imported: boolean
}

// Helper to aggregate grants by database for a specific role
export function aggregateGrantsByDatabase(grants: PlatformGrant[], roleName: string): DatabaseAccess[] {
  // Case-insensitive matching for role name
  const roleGrants = grants.filter(
    g => g.grantee_name.toUpperCase() === roleName.toUpperCase() && g.grantee_type === 'ROLE'
  )

  const dbMap = new Map<string, { schemas: Set<string>; privileges: Set<string> }>()

  for (const grant of roleGrants) {
    // Skip grants without database context (e.g., WAREHOUSE grants)
    if (!grant.object_database && grant.object_type === 'WAREHOUSE') {
      continue
    }

    const dbName = grant.object_database || grant.object_name || 'ACCOUNT'
    if (!dbMap.has(dbName)) {
      dbMap.set(dbName, { schemas: new Set(), privileges: new Set() })
    }
    const entry = dbMap.get(dbName)!
    if (grant.object_schema) {
      entry.schemas.add(grant.object_schema)
    }
    entry.privileges.add(grant.privilege)
  }

  return Array.from(dbMap.entries()).map(([dbName, data]) => ({
    database: dbName,
    schemaCount: data.schemas.size,
    privileges: Array.from(data.privileges),
  }))
}

interface UseCanvasDataResult {
  loading: boolean
  connectionId: string | null
  users: PlatformUser[]
  roles: PlatformRole[]
  assignments: RoleAssignment[]
  databases: PlatformDatabase[]
  initialNodes: Node[]
  initialEdges: Edge[]
}

export function useCanvasData(showSystemObjects: boolean = false): UseCanvasDataResult {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [roles, setRoles] = useState<PlatformRole[]>([])
  const [assignments, setAssignments] = useState<RoleAssignment[]>([])
  const [databases, setDatabases] = useState<PlatformDatabase[]>([])
  const [initialNodes, setInitialNodes] = useState<Node[]>([])
  const [initialEdges, setInitialEdges] = useState<Edge[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken()
        if (!token) {
          setLoading(false)
          return
        }

        // Get connections
        const connections = await api.get<ApiConnection[]>('/connections', token)
        if (!connections || connections.length === 0) {
          setLoading(false)
          return
        }

        const connId = connections[0]!.id
        setConnectionId(connId)

        // Load all data in parallel (including databases now)
        const [usersData, rolesData, assignmentsData, databasesData] = await Promise.all([
          api.get<PlatformUser[]>(`/objects/users?connection_id=${connId}`, token),
          api.get<PlatformRole[]>(`/objects/roles?connection_id=${connId}`, token),
          api.get<RoleAssignment[]>(`/objects/role-assignments?connection_id=${connId}`, token),
          api.get<PlatformDatabase[]>(`/objects/databases?connection_id=${connId}`, token),
        ])

        setUsers(usersData || [])
        setRoles(rolesData || [])
        setAssignments(assignmentsData || [])
        setDatabases(databasesData || [])

        // Build initial nodes and edges (now includes databases)
        const { nodes, edges } = buildCanvasLayout(
          usersData || [],
          rolesData || [],
          assignmentsData || [],
          databasesData || [],
          showSystemObjects
        )

        setInitialNodes(nodes)
        setInitialEdges(edges)
      } catch (error) {
        console.error('Failed to load canvas data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [getToken, showSystemObjects])

  return {
    loading,
    connectionId,
    users,
    roles,
    assignments,
    databases,
    initialNodes,
    initialEdges,
  }
}

// Layout constants
const LAYOUT = {
  USER_X: 50,
  BUSINESS_ROLE_X: 350,
  FUNCTIONAL_ROLE_X: 650,
  DATABASE_X: 950,
  START_Y: 50,
  ROW_HEIGHT: 80,
} as const

function buildCanvasLayout(
  users: PlatformUser[],
  roles: PlatformRole[],
  assignments: RoleAssignment[],
  databases: PlatformDatabase[],
  showSystemObjects: boolean
): { nodes: Node[]; edges: Edge[] } {
  // Filter out system roles unless showSystemObjects is true
  const filteredRoles = showSystemObjects ? roles : roles.filter(r => !r.is_system)

  // Separate business and functional roles
  const businessRoles = filteredRoles.filter(
    r => r.role_type === 'business' || r.role_type === 'hybrid' || !r.role_type
  )
  const functionalRoles = filteredRoles.filter(r => r.role_type === 'functional')

  // Create user nodes
  const userNodes: Node[] = users.map((user, index) => ({
    id: `user-${user.name}`,
    type: 'user',
    position: { x: LAYOUT.USER_X, y: LAYOUT.START_Y + index * LAYOUT.ROW_HEIGHT },
    data: { label: user.name, email: user.email },
  }))

  // Create business role nodes
  const businessRoleNodes: Node[] = businessRoles.map((role, index) => ({
    id: `role-${role.name}`,
    type: 'role',
    position: { x: LAYOUT.BUSINESS_ROLE_X, y: LAYOUT.START_Y + index * LAYOUT.ROW_HEIGHT },
    data: { label: role.name, type: role.role_type || 'business', isSystem: role.is_system },
  }))

  // Create functional role nodes
  const functionalRoleNodes: Node[] = functionalRoles.map((role, index) => ({
    id: `role-${role.name}`,
    type: 'role',
    position: { x: LAYOUT.FUNCTIONAL_ROLE_X, y: LAYOUT.START_Y + index * LAYOUT.ROW_HEIGHT },
    data: { label: role.name, type: role.role_type, isSystem: role.is_system },
  }))

  const allRoleNodes = [...businessRoleNodes, ...functionalRoleNodes]

  // Filter out system/imported databases unless showSystemObjects is true
  const filteredDatabases = showSystemObjects ? databases : databases.filter(db => !db.is_imported)

  // Create database nodes (using databaseGroup type for expandable behavior)
  const databaseNodes: Node[] = filteredDatabases.map((db, index) => ({
    id: `db-${db.name}`,
    type: 'databaseGroup',
    position: { x: LAYOUT.DATABASE_X, y: LAYOUT.START_Y + index * LAYOUT.ROW_HEIGHT },
    data: {
      label: db.name,
      schemaCount: db.schema_count,
      isImported: db.is_imported,
      isExpanded: false,
      schemas: [],
    },
  }))

  // Create user-to-role edges
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
      const sourceExists = userNodes.some(n => n.id === edge.source)
      const targetExists = allRoleNodes.some(n => n.id === edge.target)
      return sourceExists && targetExists
    })

  // Create role-to-role edges
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

  // Add button nodes
  const addUserNode: Node = {
    id: 'add-user-button',
    type: 'addButton',
    position: { x: LAYOUT.USER_X, y: LAYOUT.START_Y + users.length * LAYOUT.ROW_HEIGHT },
    data: { label: 'Add User', type: 'user', onClick: () => {} },
    selectable: false,
    draggable: false,
  }

  const addRoleNode: Node = {
    id: 'add-role-button',
    type: 'addButton',
    position: { x: LAYOUT.BUSINESS_ROLE_X, y: LAYOUT.START_Y + businessRoles.length * LAYOUT.ROW_HEIGHT },
    data: { label: 'Add Business Role', type: 'role', onClick: () => {} },
    selectable: false,
    draggable: false,
  }

  const allNodes = [...userNodes, ...allRoleNodes, ...databaseNodes, addUserNode, addRoleNode]
  const allEdges = [...assignmentEdges, ...roleToRoleEdges]

  return { nodes: allNodes, edges: allEdges }
}

// Export layout constants for use elsewhere
export { LAYOUT }
