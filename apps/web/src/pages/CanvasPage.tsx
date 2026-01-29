import { useCallback, useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
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
  OnConnectStart,
  OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import {
  nodeTypes,
  edgeTypes,
  AddUserModal,
  AddRoleModal,
  PendingChangesPanel,
  CanvasLegend,
  useCanvasData,
  usePendingChanges,
  useDatabaseFocus,
  useDatabaseExpansion,
  UserDetails,
  PendingChange,
} from '@/components/canvas'
import { useToast } from '@/hooks/use-toast'

export default function CanvasPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Filter state
  const [showSystemObjects, setShowSystemObjects] = useState(false)

  // Load canvas data
  const {
    loading,
    connectionId,
    initialNodes,
    initialEdges,
  } = useCanvasData(showSystemObjects)

  // Canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [baseNodes, setBaseNodes] = useState<Node[]>([])
  const [baseEdges, setBaseEdges] = useState<Edge[]>([])

  // Connection target highlight - which database is being hovered while dragging from a role
  const [connectionTargetDb, setConnectionTargetDb] = useState<string | null>(null)

  // Modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [addRoleType, setAddRoleType] = useState<'business' | 'functional'>('business')
  const [submitting, setSubmitting] = useState(false)

  // Track if canvas has been initialized to prevent re-initialization from wiping state
  const hasInitialized = useRef(false)
  const previousConnectionId = useRef<string | null>(null)

  // Initialize canvas when data loads - ONLY ONCE per connection
  useEffect(() => {
    // Reset initialization if connection changes
    if (connectionId !== previousConnectionId.current) {
      hasInitialized.current = false
      previousConnectionId.current = connectionId
    }

    // Only initialize if we have nodes and haven't initialized yet
    if (initialNodes.length > 0 && !hasInitialized.current) {
      console.log('Initializing canvas with', initialNodes.length, 'nodes and', initialEdges.length, 'edges')
      setNodes(initialNodes)
      setEdges(initialEdges)
      setBaseNodes(initialNodes)
      setBaseEdges(initialEdges)
      hasInitialized.current = true
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, connectionId])

  // Pending changes management
  const {
    pendingChanges,
    addGrantRole,
    addRevokeRole,
    addCreateUser,
    addCreateRole,
    addGrantPrivilege,
    addInheritRole,
    togglePrivilege,
    removePendingChange,
    clearAllChanges,
  } = usePendingChanges(nodes, setNodes, edges, setEdges)

  // Database focus - shows role-to-database connections when clicking a role
  const { focusedRole, focusedRoleGrants, focusOnRole, clearFocus } = useDatabaseFocus(
    baseNodes,
    baseEdges,
    setNodes,
    setEdges
  )

  // Database expansion - shows schemas when dragging to a database or clicking
  const {
    expandedDatabase,
    toggleDatabase,
    expandDatabase,
    collapseDatabase,
  } = useDatabaseExpansion(baseNodes, setNodes)

  // Callback for privilege toggle from database nodes
  const handlePrivilegeToggle = useCallback((
    databaseName: string,
    privilege: string,
    objectType: 'DATABASE' | 'SCHEMA',
    schemaName?: string,
    isCurrentlyGranted?: boolean
  ) => {
    if (!focusedRole) return
    togglePrivilege(focusedRole, databaseName, privilege, objectType, schemaName, isCurrentlyGranted)
  }, [focusedRole, togglePrivilege])

  // Callback for removing pending privilege changes from database nodes
  const handleRemovePendingChange = useCallback((
    changeId: string,
    changeType: 'grant_privilege' | 'revoke_privilege'
  ) => {
    removePendingChange(changeId, changeType)
  }, [removePendingChange])

  // Build pending privilege changes map for database nodes (memoized value, not function)
  const pendingPrivilegesByDb = useMemo(() => {
    const map = new Map<string, { privilege: string; objectType: 'DATABASE' | 'SCHEMA'; schemaName?: string; changeType: 'grant' | 'revoke'; roleName?: string }[]>()
    for (const change of pendingChanges) {
      if ((change.type === 'grant_privilege' || change.type === 'revoke_privilege') && change.databaseName) {
        const dbName = change.databaseName
        if (!map.has(dbName)) {
          map.set(dbName, [])
        }
        if (change.privilege && change.objectType) {
          map.get(dbName)!.push({
            privilege: change.privilege,
            objectType: change.objectType,
            schemaName: change.schemaName,
            changeType: change.type === 'grant_privilege' ? 'grant' : 'revoke',
            roleName: change.roleName,
          })
        }
      }
    }
    return map
  }, [pendingChanges])

  // Update database nodes with grant highlights when a role is focused
  // Also handles pending privilege changes display on database nodes
  // Using useLayoutEffect to ensure this runs synchronously before paint,
  // preventing race conditions with expandDatabase's setNodes call
  useLayoutEffect(() => {
    // Always update database nodes with pending changes, regardless of focus state
    setNodes(nds => nds.map(node => {
      // Check both type and id prefix to catch databases during type transitions
      if (node.type === 'databaseGroup' || node.type === 'database' || node.id.startsWith('db-')) {
        const dbName = node.id.replace('db-', '')
        const grantDetails = focusedRoleGrants.get(dbName)
        const pendingChangesForDb = pendingPrivilegesByDb.get(dbName)
        const hasFocus = focusedRoleGrants.size > 0 || focusedRole

        return {
          ...node,
          data: {
            ...node.data,
            highlightedDbPrivileges: hasFocus ? grantDetails?.dbPrivileges : undefined,
            highlightedSchemas: hasFocus ? grantDetails?.schemas : undefined,
            focusedRole: hasFocus ? (focusedRole || undefined) : undefined,
            // ALWAYS set pending changes - this is critical for showing grants after connection
            pendingPrivilegeChanges: pendingChangesForDb,
            onPrivilegeToggle: hasFocus ? handlePrivilegeToggle : undefined,
            onRemovePendingChange: handleRemovePendingChange,
            // Highlight as connection target when dragging from role
            isConnectionTarget: connectionTargetDb === dbName,
          },
        }
      }
      return node
    }))
  }, [focusedRoleGrants, focusedRole, setNodes, handlePrivilegeToggle, handleRemovePendingChange, pendingPrivilegesByDb, expandedDatabase, connectionTargetDb])

  // Lineage focus state - track which node is focused
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  // Toggle focus on/off when clicking the same node
  const setFocusedNode = useCallback((nodeId: string | null) => {
    setFocusedNodeId(prev => prev === nodeId ? null : nodeId)
  }, [])

  // Apply lineage fading when focusedNodeId changes
  // We compute lineage inline using current edges to include dynamic role-db edges
  useEffect(() => {
    if (!focusedNodeId) {
      // Check if we should skip the visual reset (after a successful connection)
      const shouldSkipReset = skipCollapseOnFocusClear.current

      // Clear all fading when no node is focused
      setNodes(nds => nds.map(node => ({
        ...node,
        data: {
          ...node.data,
          isFaded: false,
        },
      })))

      // Reset edge opacity - but keep pending edges visible
      setEdges(eds => eds.map(edge => ({
        ...edge,
        style: {
          ...edge.style,
          opacity: 1,
        },
      })))

      // Collapse any expanded database when focus is cleared, unless we just made a connection
      if (expandedDatabase && !shouldSkipReset) {
        collapseDatabase()
      }
      // Reset the skip flag after checking it
      skipCollapseOnFocusClear.current = false
      return
    }

    // Compute lineage using current edges state (includes dynamic edges)
    // We need to track which databases to expand after computing lineage
    let databasesToExpand: string[] = []

    // Use functional update to access current edges
    setEdges(currentEdges => {
      // Build adjacency maps
      const outgoing = new Map<string, string[]>()
      const incoming = new Map<string, string[]>()
      const edgeMap = new Map<string, { source: string; target: string }>()

      for (const edge of currentEdges) {
        if (edge.source.includes('add-') || edge.target.includes('add-')) continue
        edgeMap.set(edge.id, { source: edge.source, target: edge.target })

        if (!outgoing.has(edge.source)) outgoing.set(edge.source, [])
        outgoing.get(edge.source)!.push(edge.target)

        if (!incoming.has(edge.target)) incoming.set(edge.target, [])
        incoming.get(edge.target)!.push(edge.source)
      }

      // Directional traversal: only follow edges in the correct direction
      // Upstream = sources (users/roles that grant to this node)
      // Downstream = targets (roles/databases this node grants to)
      const connectedNodes = new Set<string>([focusedNodeId])
      const connectedEdges = new Set<string>()
      const connectedDatabases: string[] = []

      // Traverse UPSTREAM (incoming edges) - find users/roles that connect TO this node
      const upstreamQueue = [focusedNodeId]
      const upstreamVisited = new Set<string>([focusedNodeId])
      while (upstreamQueue.length > 0) {
        const current = upstreamQueue.shift()!
        for (const source of incoming.get(current) || []) {
          if (!upstreamVisited.has(source)) {
            upstreamVisited.add(source)
            connectedNodes.add(source)
            // Only continue upstream traversal for user->role edges, not role->role
            // This prevents going back through the whole graph
            if (source.startsWith('user-')) {
              upstreamQueue.push(source)
            }
          }
        }
      }

      // Traverse DOWNSTREAM (outgoing edges) - find roles/databases this node connects TO
      const downstreamQueue = [focusedNodeId]
      const downstreamVisited = new Set<string>([focusedNodeId])
      while (downstreamQueue.length > 0) {
        const current = downstreamQueue.shift()!
        for (const target of outgoing.get(current) || []) {
          if (!downstreamVisited.has(target)) {
            downstreamVisited.add(target)
            connectedNodes.add(target)
            // Track connected databases for expansion
            if (target.startsWith('db-')) {
              connectedDatabases.push(target.replace('db-', ''))
            }
            // Continue downstream traversal for role->role and role->db edges
            // But don't go back upstream from databases
            if (!target.startsWith('db-')) {
              downstreamQueue.push(target)
            }
          }
        }
      }

      // Find edges that connect nodes in the lineage
      for (const [edgeId, { source, target }] of edgeMap) {
        if (connectedNodes.has(source) && connectedNodes.has(target)) {
          connectedEdges.add(edgeId)
        }
      }

      // Update nodes with fading
      // Note: connectionTargetDb is accessed from the outer scope to prevent fading the drop target
      setNodes(nds => nds.map(node => {
        // Never fade the connection target database - it should always be visible when dragging
        const isConnectionTarget = node.id === `db-${connectionTargetDb}`
        return {
          ...node,
          data: {
            ...node.data,
            isFaded: isConnectionTarget ? false : !connectedNodes.has(node.id),
          },
        }
      }))

      // Store databases to expand (will be done after state updates complete)
      databasesToExpand = connectedDatabases

      // Return edges with faded styling (use 0 to completely hide non-lineage edges)
      return currentEdges.map(edge => ({
        ...edge,
        style: {
          ...edge.style,
          opacity: connectedEdges.has(edge.id) ? 1 : 0,
        },
      }))
    })

    // Expand the first connected database after a short delay to let state updates settle
    if (connectionId) {
      setTimeout(async () => {
        if (databasesToExpand.length > 0) {
          const token = await getToken()
          if (token && databasesToExpand[0]) {
            expandDatabase(databasesToExpand[0], connectionId, token)
          }
        }
      }, 50)
    }
  }, [focusedNodeId, focusedRole, setNodes, setEdges, connectionId, getToken, expandDatabase, expandedDatabase, collapseDatabase, connectionTargetDb])

  // Track connection drag state
  const connectingFromRole = useRef<string | null>(null)
  const connectionMadeToDatabase = useRef<string | null>(null)
  // Track if we should skip collapse when clearing focus (after successful connection)
  const skipCollapseOnFocusClear = useRef<boolean>(false)

  // Handle connection start - detect when dragging from a role
  // Also activate focus mode to show lineage and allow schema-level targeting
  const onConnectStart: OnConnectStart = useCallback(
    async (_event, { nodeId }) => {
      if (nodeId?.startsWith('role-')) {
        const roleName = nodeId.replace('role-', '')
        connectingFromRole.current = roleName
        connectionMadeToDatabase.current = null

        // Activate focus mode for this role - shows lineage and database connections
        setFocusedNodeId(nodeId)
        if (connectionId) {
          const token = await getToken()
          if (token) {
            focusOnRole(roleName, connectionId, token)
          }
        }
      }
    },
    [connectionId, getToken, focusOnRole]
  )

  // Handle connection end - keep focus mode if connection was made so user can add more grants
  const onConnectEnd: OnConnectEnd = useCallback(() => {
    const madeConnection = connectionMadeToDatabase.current
    const connectingRole = connectingFromRole.current
    connectingFromRole.current = null

    // Clear the connection target highlight
    setConnectionTargetDb(null)

    // If no connection was made, clear everything immediately
    if (!madeConnection) {
      setTimeout(() => {
        clearFocus()
        setFocusedNodeId(null)
        if (expandedDatabase) {
          collapseDatabase()
        }
      }, 100)
      return
    }

    // If a connection WAS made, KEEP the focus so user can click more privileges
    // This mimics the behavior of clicking on a role - the role stays focused
    // and the user can continue adding/removing grants
    // Just reset the connection tracking ref
    connectionMadeToDatabase.current = null

    // The focusedNodeId and focusedRole are already set from onConnectStart
    // so we don't clear them - this keeps the focus mode active
    console.log('Connection made, keeping focus on role:', connectingRole)
  }, [expandedDatabase, collapseDatabase, clearFocus])

  // Handle node mouse enter - expand database and highlight when dragging from role
  const onNodeMouseEnter = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      // Only process if we're dragging from a role
      if (!connectingFromRole.current) return
      // Handle both database and databaseGroup node types
      if (!node.id.startsWith('db-')) return

      const databaseName = node.id.replace('db-', '')

      // Set this database as the connection target (for green highlight)
      setConnectionTargetDb(databaseName)

      // Expand the database if we have a connection
      if (connectionId) {
        const token = await getToken()
        if (token) {
          expandDatabase(databaseName, connectionId, token)
        }
      }
    },
    [connectionId, getToken, expandDatabase]
  )

  // Handle node mouse leave - clear connection target highlight
  const onNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Only clear if we're dragging from a role and leaving a database
      if (!connectingFromRole.current) return
      if (!node.id.startsWith('db-')) return

      // Clear the connection target highlight
      setConnectionTargetDb(null)
    },
    []
  )

  // Handle new connections (user -> role grants, role -> database/schema privileges)
  const onConnect = useCallback(
    (params: FlowConnection) => {
      // User to Role connection
      if (params.source?.startsWith('user-') && params.target?.startsWith('role-')) {
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
        return
      }

      // Role to Database connection - handle privilege-specific or general connections
      // Handle both standalone db nodes and grouped db nodes
      if (params.source?.startsWith('role-') && params.target?.startsWith('db-')) {
        const roleName = params.source.replace('role-', '')
        const databaseName = params.target.replace('db-', '')

        // Mark that a connection was made to this database - keeps it expanded
        connectionMadeToDatabase.current = databaseName

        // FIRST: Add the pending privilege grant
        // Check if connection is to a specific database privilege
        // targetHandle will be like "db-priv-{privilege}" for direct privilege grants
        if (params.targetHandle?.startsWith('db-priv-')) {
          const privilege = params.targetHandle.replace('db-priv-', '')
          addGrantPrivilege(roleName, databaseName, [{
            privilege,
            objectType: 'DATABASE',
            objectName: databaseName,
          }])
        } else if (params.targetHandle?.includes('-priv-')) {
          // Check if connection is to a schema-level privilege
          // targetHandle will be like "schema-{schemaName}-priv-{privilege}"
          const parts = params.targetHandle.split('-priv-')
          const schemaName = parts[0]?.replace('schema-', '')
          const privilege = parts[1]
          if (schemaName && privilege) {
            addGrantPrivilege(roleName, `${databaseName}.${schemaName}`, [{
              privilege,
              objectType: 'SCHEMA',
              objectName: `${databaseName}.${schemaName}`,
            }])
          }
        } else {
          // For general database connections (dropping on the database node itself),
          // grant USAGE privilege by default
          addGrantPrivilege(roleName, databaseName, [{
            privilege: 'USAGE',
            objectType: 'DATABASE',
            objectName: databaseName,
          }])
        }

        // THEN: Expand the database with a delay to allow state updates to process
        // This ensures pendingPrivilegeChanges is set on the node before expansion runs
        // We use 200ms to ensure React has time to process the pendingChanges state update
        // and the useLayoutEffect has run to set pendingPrivilegeChanges on the node
        if (connectionId) {
          setTimeout(async () => {
            const token = await getToken()
            if (token) {
              expandDatabase(databaseName, connectionId, token)
            }
          }, 200)
        }
        return
      }

      // Role to Role connection (inheritance)
      // Parent role (source) grants its privileges to child role (target)
      if (params.source?.startsWith('role-') && params.target?.startsWith('role-')) {
        const parentRoleName = params.source.replace('role-', '')
        const childRoleName = params.target.replace('role-', '')

        // Don't allow self-referential connections
        if (parentRoleName === childRoleName) return

        addInheritRole(parentRoleName, childRoleName)
        return
      }
    },
    [setEdges, addGrantRole, addGrantPrivilege, addInheritRole, connectionId, getToken, expandDatabase]
  )

  // Handle node clicks
  const onNodeClick = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      console.log('Node clicked:', node.id, node.type)
      if (node.id === 'add-user-button') {
        setShowAddUserModal(true)
      } else if (node.id === 'add-business-role-button') {
        setAddRoleType('business')
        setShowAddRoleModal(true)
      } else if (node.id === 'add-functional-role-button') {
        setAddRoleType('functional')
        setShowAddRoleModal(true)
      } else if (node.type === 'user') {
        // Focus on user to show lineage
        setFocusedNode(node.id)
      } else if (node.type === 'role' && connectionId) {
        // Focus on role to show lineage and database access
        setFocusedNode(node.id)
        console.log('Role clicked, fetching grants for:', node.data.label)
        const token = await getToken()
        if (token) {
          focusOnRole(node.data.label as string, connectionId, token)
        }
      } else if ((node.type === 'database' || node.type === 'databaseGroup') && connectionId) {
        // Don't set focus on database - it's a leaf node with no meaningful lineage
        // Just toggle database expansion when clicked
        const databaseName = node.id.replace('db-', '')
        const token = await getToken()
        if (token) {
          toggleDatabase(databaseName, connectionId, token)
        }
      }
    },
    [focusOnRole, toggleDatabase, connectionId, getToken, setFocusedNode]
  )

  // Handle pane click (empty canvas space) - clear focus
  const onPaneClick = useCallback(() => {
    if (focusedRole) {
      clearFocus()
    }
    if (focusedNodeId) {
      setFocusedNode(null)
    }
  }, [focusedRole, clearFocus, focusedNodeId, setFocusedNode])

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
    (roleName: string, roleType: 'business' | 'functional', inheritedRoles: string[], assignedUsers: string[]) => {
      addCreateRole(roleName, inheritedRoles, assignedUsers, roleType)
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

      const changes = pendingChanges.flatMap(change => {
        if (change.type === 'create_user' && change.userDetails) {
          const d = change.userDetails
          return [{
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
          }]
        } else if (change.type === 'create_role') {
          return [{
            change_type: 'create_role',
            object_type: 'role',
            object_name: change.roleName,
            details: {},
          }]
        } else if (change.type === 'grant_privilege' && change.privilegeGrants) {
          // Each privilege grant becomes a separate change
          return change.privilegeGrants.map(grant => ({
            change_type: 'grant',
            object_type: grant.objectType.toLowerCase(),
            object_name: grant.objectName,
            details: {
              role_name: change.roleName,
              privilege: grant.privilege,
              object_type: grant.objectType,
              object_name: grant.objectName,
            },
          }))
        } else if (change.type === 'grant_privilege' && change.privilege && change.objectType) {
          // Single privilege grant from toggle
          const objectName = change.objectType === 'SCHEMA' && change.schemaName
            ? `${change.databaseName}.${change.schemaName}`
            : change.databaseName
          return [{
            change_type: 'grant',
            object_type: change.objectType.toLowerCase(),
            object_name: objectName,
            details: {
              role_name: change.roleName,
              privilege: change.privilege,
              object_type: change.objectType,
              object_name: objectName,
            },
          }]
        } else if (change.type === 'revoke_privilege' && change.privilege && change.objectType) {
          // Single privilege revoke from toggle
          const objectName = change.objectType === 'SCHEMA' && change.schemaName
            ? `${change.databaseName}.${change.schemaName}`
            : change.databaseName
          return [{
            change_type: 'revoke',
            object_type: change.objectType.toLowerCase(),
            object_name: objectName,
            details: {
              role_name: change.roleName,
              privilege: change.privilege,
              object_type: change.objectType,
              object_name: objectName,
            },
          }]
        } else if (change.type === 'inherit_role' && change.parentRoleName && change.childRoleName) {
          // Role inheritance: grant parent role to child role
          return [{
            change_type: 'grant',
            object_type: 'role_inheritance',
            object_name: `${change.parentRoleName} -> ${change.childRoleName}`,
            details: {
              parent_role: change.parentRoleName,
              child_role: change.childRoleName,
            },
          }]
        } else {
          return [{
            change_type: change.type === 'grant_role' ? 'grant' : 'revoke',
            object_type: 'role_assignment',
            object_name: `${change.userName} -> ${change.roleName}`,
            details: {
              user_name: change.userName,
              role_name: change.roleName,
            },
          }]
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
      toast({
        title: 'Changeset created',
        description: 'Your changes have been saved and are ready for review.',
      })
      navigate('/changesets')
    } catch (error) {
      console.error('Failed to create changeset:', error)
      toast({
        title: 'Error',
        description: 'Failed to create changeset. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }, [connectionId, pendingChanges, getToken, navigate, clearAllChanges, toast])

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

      <CanvasLegend
        focusedRole={focusedRole}
        onClearFocus={clearFocus}
        showSystemObjects={showSystemObjects}
        onToggleSystemObjects={setShowSystemObjects}
      />

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        <div className="flex-1 border rounded-lg overflow-hidden bg-slate-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            connectionRadius={40}
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
          roleType={addRoleType}
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
  const inheritRoleCount = changes.filter(c => c.type === 'inherit_role').length
  const grantPrivilegeCount = changes.filter(c => c.type === 'grant_privilege').reduce(
    (sum, c) => sum + (c.privilegeGrants?.length || 1),
    0
  )
  const revokePrivilegeCount = changes.filter(c => c.type === 'revoke_privilege').length

  const parts = []
  if (createUserCount > 0) parts.push(`${createUserCount} new user${createUserCount > 1 ? 's' : ''}`)
  if (createRoleCount > 0) parts.push(`${createRoleCount} new role${createRoleCount > 1 ? 's' : ''}`)
  if (grantCount > 0) parts.push(`${grantCount} role grant${grantCount > 1 ? 's' : ''}`)
  if (revokeCount > 0) parts.push(`${revokeCount} role revoke${revokeCount > 1 ? 's' : ''}`)
  if (inheritRoleCount > 0) parts.push(`${inheritRoleCount} role inheritance${inheritRoleCount > 1 ? 's' : ''}`)
  if (grantPrivilegeCount > 0) parts.push(`${grantPrivilegeCount} privilege grant${grantPrivilegeCount > 1 ? 's' : ''}`)
  if (revokePrivilegeCount > 0) parts.push(`${revokePrivilegeCount} privilege revoke${revokePrivilegeCount > 1 ? 's' : ''}`)

  return `Access Canvas changes (${parts.join(', ')})`
}
