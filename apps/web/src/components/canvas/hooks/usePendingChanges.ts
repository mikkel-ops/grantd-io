import { useState, useCallback } from 'react'
import { Node, Edge } from '@xyflow/react'
import { UserDetails } from '../AddUserModal'
import { PrivilegeGrant } from '../GrantPrivilegesModal'
import { LAYOUT } from './useCanvasData'

export interface PendingChange {
  id: string
  type: 'grant_role' | 'revoke_role' | 'create_user' | 'create_role' | 'grant_privilege' | 'revoke_privilege' | 'inherit_role' | 'revoke_db_access' | 'drop_user' | 'drop_role'
  userName?: string
  roleName?: string
  parentRoleName?: string  // For inherit_role: the role being inherited from
  childRoleName?: string   // For inherit_role: the role that inherits
  userDetails?: UserDetails
  privilegeGrants?: PrivilegeGrant[]
  databaseName?: string
  schemaName?: string
  privilege?: string
  objectType?: 'DATABASE' | 'SCHEMA'
}

interface UsePendingChangesResult {
  pendingChanges: PendingChange[]
  addGrantRole: (userName: string, roleName: string) => void
  addRevokeRole: (userName: string, roleName: string, edgeId: string) => void
  addCreateUser: (details: UserDetails) => void
  addCreateRole: (roleName: string, inheritedRoles: string[], assignedUsers: string[], roleType?: 'business' | 'functional') => void
  addGrantPrivilege: (roleName: string, databaseName: string, grants: PrivilegeGrant[]) => void
  addInheritRole: (parentRoleName: string, childRoleName: string) => void
  addRevokeDbAccess: (roleName: string, databaseName: string, edgeId: string) => void
  togglePrivilege: (roleName: string, databaseName: string, privilege: string, objectType: 'DATABASE' | 'SCHEMA', schemaName?: string, isCurrentlyGranted?: boolean) => void
  addDropUser: (userName: string) => void
  addDropRole: (roleName: string) => void
  removePendingChange: (changeId: string, changeType: PendingChange['type']) => void
  clearAllChanges: () => void
  cancelRevoke: (changeId: string) => void
}

export function usePendingChanges(
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  _edges: Edge[],
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
): UsePendingChangesResult {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])

  const addGrantRole = useCallback((userName: string, roleName: string) => {
    setPendingChanges(prev => [
      ...prev,
      {
        id: `${userName}-${roleName}`,
        type: 'grant_role',
        userName,
        roleName,
      },
    ])
  }, [])

  const addRevokeRole = useCallback((userName: string, roleName: string, edgeId: string) => {
    const changeId = `${userName}-${roleName}`

    // Check if already pending
    if (pendingChanges.some(c => c.id === changeId && c.type === 'revoke_role')) {
      return
    }

    // Update edge to revoke style
    setEdges(eds => eds.map(e => {
      if (e.id === edgeId) {
        return {
          ...e,
          id: `revoke-${changeId}`,
          style: { stroke: '#ef4444', strokeDasharray: '5,5', strokeWidth: 2 },
          animated: true,
        }
      }
      return e
    }))

    setPendingChanges(prev => [
      ...prev,
      {
        id: changeId,
        type: 'revoke_role',
        userName,
        roleName,
      },
    ])
  }, [pendingChanges, setEdges])

  const addCreateUser = useCallback((details: UserDetails) => {
    const userCount = nodes.filter(n => n.type === 'user').length
    const newUserNode: Node = {
      id: `user-${details.userName}`,
      type: 'user',
      position: { x: LAYOUT.USER_X, y: LAYOUT.START_Y + userCount * LAYOUT.ROW_HEIGHT },
      data: { label: details.userName, email: details.email, isNew: true },
    }

    // Button stays at top, just add the new user node
    setNodes(nds => [...nds, newUserNode])

    setPendingChanges(prev => [
      ...prev,
      {
        id: details.userName,
        type: 'create_user',
        userName: details.userName,
        userDetails: details,
      },
    ])
  }, [nodes, setNodes])

  const addCreateRole = useCallback((roleName: string, inheritedRoles: string[], assignedUsers: string[], roleType: 'business' | 'functional' = 'business') => {
    const isFunctional = roleType === 'functional'
    const xPosition = isFunctional ? LAYOUT.FUNCTIONAL_ROLE_X : LAYOUT.BUSINESS_ROLE_X

    const roleCount = nodes.filter(n => n.type === 'role' && n.position.x === xPosition).length
    const newRoleNode: Node = {
      id: `role-${roleName}`,
      type: 'role',
      position: { x: xPosition, y: LAYOUT.START_Y + roleCount * LAYOUT.ROW_HEIGHT },
      data: { label: roleName, type: roleType, isSystem: false, isNew: true },
    }

    // Button stays at top, just add the new role node
    setNodes(nds => [...nds, newRoleNode])

    setPendingChanges(prev => [
      ...prev,
      {
        id: roleName,
        type: 'create_role',
        roleName,
      },
    ])

    // Add edges for inherited roles
    if (inheritedRoles.length > 0) {
      const newEdges: Edge[] = inheritedRoles.map((parentRole, idx) => ({
        id: `role-edge-new-${roleName}-${parentRole}-${idx}`,
        source: `role-${parentRole}`,
        target: `role-${roleName}`,
        style: { stroke: '#6b7280', strokeDasharray: '5,5' },
      }))
      setEdges(eds => [...eds, ...newEdges])
    }

    // Add edges for assigned users
    if (assignedUsers.length > 0) {
      const newEdges: Edge[] = assignedUsers.map((user, idx) => ({
        id: `pending-${user}-${roleName}-new-${idx}`,
        source: `user-${user}`,
        target: `role-${roleName}`,
        animated: true,
        style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
      }))
      setEdges(eds => [...eds, ...newEdges])
    }
  }, [nodes, setNodes, setEdges])

  // Add role inheritance (parent role grants to child role)
  const addInheritRole = useCallback((parentRoleName: string, childRoleName: string) => {
    const changeId = `inherit-${parentRoleName}-${childRoleName}`

    // Check if already pending
    setPendingChanges(prev => {
      if (prev.some(c => c.id === changeId)) {
        return prev
      }
      return [
        ...prev,
        {
          id: changeId,
          type: 'inherit_role' as const,
          parentRoleName,
          childRoleName,
        },
      ]
    })

    // Add visual edge from parent role to child role
    const edgeId = `pending-inherit-${parentRoleName}-${childRoleName}`
    setEdges(eds => {
      // Don't add duplicate edges
      if (eds.some(e => e.id === edgeId)) {
        return eds
      }
      return [
        ...eds,
        {
          id: edgeId,
          source: `role-${parentRoleName}`,
          target: `role-${childRoleName}`,
          animated: true,
          style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
        },
      ]
    })
  }, [setEdges])

  // Revoke all database access for a role (clicking on role-db edge)
  const addRevokeDbAccess = useCallback((roleName: string, databaseName: string, edgeId: string) => {
    const changeId = `revoke-db-${roleName}-${databaseName}`

    // Check if already pending
    if (pendingChanges.some(c => c.id === changeId && c.type === 'revoke_db_access')) {
      return
    }

    // Update edge to revoke style (red dashed)
    setEdges(eds => eds.map(e => {
      if (e.id === edgeId) {
        return {
          ...e,
          id: `revoke-db-edge-${roleName}-${databaseName}`,
          style: { stroke: '#ef4444', strokeDasharray: '5,5', strokeWidth: 2 },
          animated: true,
        }
      }
      return e
    }))

    setPendingChanges(prev => [
      ...prev,
      {
        id: changeId,
        type: 'revoke_db_access',
        roleName,
        databaseName,
      },
    ])
  }, [pendingChanges, setEdges])

  const addGrantPrivilege = useCallback((roleName: string, databaseName: string, grants: PrivilegeGrant[]) => {
    // Build the pending privilege changes that will be added
    const newPendingChanges: { privilege: string; objectType: 'DATABASE' | 'SCHEMA'; schemaName?: string; changeType: 'grant' | 'revoke'; roleName: string }[] = []

    // For each grant, create a separate pending change with consistent ID format
    // This ensures they show up correctly in the UI and can be toggled off
    for (const grant of grants) {
      const objectName = grant.objectType === 'SCHEMA'
        ? grant.objectName  // Already includes database.schema
        : databaseName
      const schemaName = grant.objectType === 'SCHEMA'
        ? grant.objectName.split('.')[1]
        : undefined
      const changeId = `toggle-${roleName}-${objectName}-${grant.privilege}`

      // Check if this exact change already exists - if so, skip it
      setPendingChanges(prev => {
        if (prev.some(c => c.id === changeId)) {
          return prev
        }
        return [
          ...prev,
          {
            id: changeId,
            type: 'grant_privilege' as const,
            roleName,
            databaseName,
            schemaName,
            privilege: grant.privilege,
            objectType: grant.objectType,
            privilegeGrants: [grant],
          },
        ]
      })

      // Track the pending change for node update
      newPendingChanges.push({
        privilege: grant.privilege,
        objectType: grant.objectType,
        schemaName,
        changeType: 'grant',
        roleName,
      })
    }

    // IMMEDIATELY update the database node with pending changes
    // This ensures the green border appears without waiting for useLayoutEffect
    const dbNodeId = `db-${databaseName}`
    setNodes(nds => nds.map(node => {
      if (node.id === dbNodeId) {
        const existingPendingChanges = (node.data as { pendingPrivilegeChanges?: typeof newPendingChanges }).pendingPrivilegeChanges || []
        return {
          ...node,
          data: {
            ...node.data,
            pendingPrivilegeChanges: [...existingPendingChanges, ...newPendingChanges],
          },
        }
      }
      return node
    }))

    // Add visual edge from role to database (only if we added changes)
    const firstGrant = grants[0]
    if (firstGrant) {
      const edgeId = `privilege-edge-${roleName}-${databaseName}-${firstGrant.privilege}`
      setEdges(eds => {
        // Don't add duplicate edges
        if (eds.some(e => e.id === edgeId)) {
          return eds
        }
        return [
          ...eds,
          {
            id: edgeId,
            source: `role-${roleName}`,
            target: `db-${databaseName}`,
            animated: true,
            style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
          },
        ]
      })
    }
  }, [setEdges, setNodes])

  const togglePrivilege = useCallback((
    roleName: string,
    databaseName: string,
    privilege: string,
    objectType: 'DATABASE' | 'SCHEMA',
    schemaName?: string,
    isCurrentlyGranted?: boolean
  ) => {
    const objectName = objectType === 'SCHEMA' && schemaName ? `${databaseName}.${schemaName}` : databaseName
    const changeId = `toggle-${roleName}-${objectName}-${privilege}`

    // Use functional update to avoid stale closure issues
    setPendingChanges(prev => {
      // Check if there's already a pending change for this privilege
      const existingChange = prev.find(c => c.id === changeId)

      if (existingChange) {
        // Toggle off - remove the pending change
        return prev.filter(c => c.id !== changeId)
      }

      // Add new pending change
      if (isCurrentlyGranted) {
        // Currently granted, so this is a revoke
        return [
          ...prev,
          {
            id: changeId,
            type: 'revoke_privilege' as const,
            roleName,
            databaseName,
            schemaName,
            privilege,
            objectType,
          },
        ]
      } else {
        // Not currently granted, so this is a grant
        return [
          ...prev,
          {
            id: changeId,
            type: 'grant_privilege' as const,
            roleName,
            databaseName,
            schemaName,
            privilege,
            objectType,
            privilegeGrants: [{
              privilege,
              objectType,
              objectName,
            }],
          },
        ]
      }
    })

    // IMMEDIATELY update the database node with the new pending change state
    const dbNodeId = `db-${databaseName}`
    setNodes(nds => nds.map(node => {
      if (node.id === dbNodeId) {
        const existingPendingChanges = (node.data as { pendingPrivilegeChanges?: { privilege: string; objectType: 'DATABASE' | 'SCHEMA'; schemaName?: string; changeType: 'grant' | 'revoke'; roleName?: string }[] }).pendingPrivilegeChanges || []

        // Check if we're removing or adding
        const existingIdx = existingPendingChanges.findIndex(
          p => p.privilege === privilege && p.objectType === objectType && p.schemaName === schemaName
        )

        let newPendingChanges
        if (existingIdx >= 0) {
          // Remove the existing pending change
          newPendingChanges = existingPendingChanges.filter((_, i) => i !== existingIdx)
        } else {
          // Add new pending change
          newPendingChanges = [
            ...existingPendingChanges,
            {
              privilege,
              objectType,
              schemaName,
              changeType: isCurrentlyGranted ? 'revoke' as const : 'grant' as const,
              roleName,
            },
          ]
        }

        return {
          ...node,
          data: {
            ...node.data,
            pendingPrivilegeChanges: newPendingChanges,
          },
        }
      }
      return node
    }))
  }, [setNodes])

  // Toggle drop user pending change
  const addDropUser = useCallback((userName: string) => {
    console.log('[addDropUser] Called with userName:', userName)
    const changeId = `drop-user-${userName}`

    setPendingChanges(prev => {
      console.log('[addDropUser] Current pending changes:', prev)
      // Toggle: if already exists, remove it
      const existing = prev.find(c => c.id === changeId)
      if (existing) {
        return prev.filter(c => c.id !== changeId)
      }
      return [...prev, { id: changeId, type: 'drop_user' as const, userName }]
    })

    // Update node styling to show pending delete state
    setNodes(nds => nds.map(n => {
      if (n.id === `user-${userName}`) {
        const currentPendingDelete = (n.data as { isPendingDelete?: boolean }).isPendingDelete
        return {
          ...n,
          data: {
            ...n.data,
            isPendingDelete: !currentPendingDelete,
          },
        }
      }
      return n
    }))
  }, [setNodes])

  // Toggle drop role pending change
  const addDropRole = useCallback((roleName: string) => {
    console.log('[addDropRole] Called with roleName:', roleName)
    const changeId = `drop-role-${roleName}`

    setPendingChanges(prev => {
      console.log('[addDropRole] Current pending changes:', prev)
      // Toggle: if already exists, remove it
      const existing = prev.find(c => c.id === changeId)
      if (existing) {
        return prev.filter(c => c.id !== changeId)
      }
      return [...prev, { id: changeId, type: 'drop_role' as const, roleName }]
    })

    // Update node styling to show pending delete state
    setNodes(nds => nds.map(n => {
      if (n.id === `role-${roleName}`) {
        const currentPendingDelete = (n.data as { isPendingDelete?: boolean }).isPendingDelete
        return {
          ...n,
          data: {
            ...n.data,
            isPendingDelete: !currentPendingDelete,
          },
        }
      }
      return n
    }))
  }, [setNodes])

  const removePendingChange = useCallback((changeId: string, changeType: PendingChange['type']) => {
    setPendingChanges(prev => prev.filter(c => c.id !== changeId))

    if (changeType === 'grant_role') {
      setEdges(eds => eds.filter(e => !e.id.includes(changeId)))
    } else if (changeType === 'revoke_role') {
      setEdges(eds => eds.map(e => {
        if (e.id === `revoke-${changeId}`) {
          return {
            ...e,
            id: `edge-restored-${changeId}`,
            style: { stroke: '#3b82f6' },
            animated: true,
          }
        }
        return e
      }))
    } else if (changeType === 'create_user') {
      // Remove the user node - button stays at top
      setNodes(nds => nds.filter(n => n.id !== `user-${changeId}`))
      setEdges(eds => eds.filter(e => e.source !== `user-${changeId}`))
    } else if (changeType === 'create_role') {
      // Remove the role node - button stays at top
      setNodes(nds => nds.filter(n => n.id !== `role-${changeId}`))
      setEdges(eds => eds.filter(e => e.target !== `role-${changeId}` && e.source !== `role-${changeId}`))
    } else if (changeType === 'grant_privilege' || changeType === 'revoke_privilege') {
      // Remove the edge
      setEdges(eds => eds.filter(e => e.id !== `privilege-edge-${changeId}`))

      // Parse changeId to extract privilege info: toggle-{roleName}-{objectName}-{privilege}
      const parts = changeId.split('-')
      if (parts.length >= 4 && parts[0] === 'toggle') {
        // Extract database name - objectName could be "DB" or "DB.SCHEMA"
        const privilege = parts[parts.length - 1]
        const objectName = parts.slice(2, -1).join('-')
        const databaseName = objectName.includes('.') ? objectName.split('.')[0] : objectName
        const schemaName = objectName.includes('.') ? objectName.split('.')[1] : undefined

        // Update the database node to remove this pending change
        const dbNodeId = `db-${databaseName}`
        setNodes(nds => nds.map(node => {
          if (node.id === dbNodeId) {
            const existingPendingChanges = (node.data as { pendingPrivilegeChanges?: { privilege: string; objectType: 'DATABASE' | 'SCHEMA'; schemaName?: string; changeType: 'grant' | 'revoke'; roleName?: string }[] }).pendingPrivilegeChanges || []

            // Remove the matching pending change
            const newPendingChanges = existingPendingChanges.filter(
              p => !(p.privilege === privilege && p.schemaName === schemaName)
            )

            return {
              ...node,
              data: {
                ...node.data,
                pendingPrivilegeChanges: newPendingChanges.length > 0 ? newPendingChanges : undefined,
              },
            }
          }
          return node
        }))
      }
    } else if (changeType === 'inherit_role') {
      // Remove the inheritance edge
      // changeId format: inherit-{parentRoleName}-{childRoleName}
      const parts = changeId.split('-')
      if (parts.length >= 3 && parts[0] === 'inherit') {
        const parentRoleName = parts[1]
        const childRoleName = parts.slice(2).join('-')
        setEdges(eds => eds.filter(e => e.id !== `pending-inherit-${parentRoleName}-${childRoleName}`))
      }
    } else if (changeType === 'revoke_db_access') {
      // Restore the role-db edge back to normal
      // changeId format: revoke-db-{roleName}-{databaseName}
      const parts = changeId.split('-')
      if (parts.length >= 4 && parts[0] === 'revoke' && parts[1] === 'db') {
        const roleName = parts[2]
        const databaseName = parts.slice(3).join('-')
        setEdges(eds => eds.map(e => {
          if (e.id === `revoke-db-edge-${roleName}-${databaseName}`) {
            return {
              ...e,
              id: `role-db-edge-${roleName}-${databaseName}`,
              style: { stroke: '#06b6d4', strokeWidth: 2 },
              animated: true,
            }
          }
          return e
        }))
      }
    } else if (changeType === 'drop_user') {
      // Remove pending delete state from user node
      // changeId format: drop-user-{userName}
      const userName = changeId.replace('drop-user-', '')
      setNodes(nds => nds.map(n => {
        if (n.id === `user-${userName}`) {
          return {
            ...n,
            data: {
              ...n.data,
              isPendingDelete: false,
            },
          }
        }
        return n
      }))
    } else if (changeType === 'drop_role') {
      // Remove pending delete state from role node
      // changeId format: drop-role-{roleName}
      const roleName = changeId.replace('drop-role-', '')
      setNodes(nds => nds.map(n => {
        if (n.id === `role-${roleName}`) {
          return {
            ...n,
            data: {
              ...n.data,
              isPendingDelete: false,
            },
          }
        }
        return n
      }))
    }
  }, [setEdges, setNodes])

  const clearAllChanges = useCallback(() => {
    setEdges(eds => {
      // Filter out pending edges, privilege edges, and inherit edges
      const filtered = eds.filter(e =>
        !e.id.startsWith('pending-') &&
        !e.id.startsWith('privilege-edge-') &&
        !e.id.startsWith('pending-inherit-')
      )
      return filtered.map(e => {
        // Restore user-role revoke edges
        if (e.id.startsWith('revoke-') && !e.id.startsWith('revoke-db-edge-')) {
          return {
            ...e,
            id: `edge-restored-${e.id.replace('revoke-', '')}`,
            style: { stroke: '#3b82f6' },
            animated: true,
          }
        }
        // Restore role-db revoke edges
        if (e.id.startsWith('revoke-db-edge-')) {
          const parts = e.id.replace('revoke-db-edge-', '').split('-')
          const roleName = parts[0]
          const databaseName = parts.slice(1).join('-')
          return {
            ...e,
            id: `role-db-edge-${roleName}-${databaseName}`,
            style: { stroke: '#06b6d4', strokeWidth: 2 },
            animated: true,
          }
        }
        return e
      })
    })
    // Clear pending delete state from all user and role nodes
    setNodes(nds => nds.map(n => {
      if (n.id.startsWith('user-') || n.id.startsWith('role-')) {
        const data = n.data as { isPendingDelete?: boolean }
        if (data.isPendingDelete) {
          return {
            ...n,
            data: {
              ...n.data,
              isPendingDelete: false,
            },
          }
        }
      }
      return n
    }))
    setPendingChanges([])
  }, [setEdges, setNodes])

  const cancelRevoke = useCallback((changeId: string) => {
    setPendingChanges(prev => prev.filter(c => c.id !== changeId))
    setEdges(eds => eds.map(e => {
      if (e.id === `revoke-${changeId}`) {
        return {
          ...e,
          id: `edge-restored-${changeId}`,
          style: { stroke: '#3b82f6' },
          animated: true,
        }
      }
      return e
    }))
  }, [setEdges])

  return {
    pendingChanges,
    addGrantRole,
    addRevokeRole,
    addCreateUser,
    addCreateRole,
    addGrantPrivilege,
    addInheritRole,
    addRevokeDbAccess,
    togglePrivilege,
    addDropUser,
    addDropRole,
    removePendingChange,
    clearAllChanges,
    cancelRevoke,
  }
}
