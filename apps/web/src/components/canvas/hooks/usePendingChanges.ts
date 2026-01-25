import { useState, useCallback } from 'react'
import { Node, Edge } from '@xyflow/react'
import { UserDetails } from '../AddUserModal'
import { PrivilegeGrant } from '../GrantPrivilegesModal'
import { LAYOUT } from './useCanvasData'

export interface PendingChange {
  id: string
  type: 'grant_role' | 'revoke_role' | 'create_user' | 'create_role' | 'grant_privilege'
  userName?: string
  roleName?: string
  userDetails?: UserDetails
  privilegeGrants?: PrivilegeGrant[]
  databaseName?: string
}

interface UsePendingChangesResult {
  pendingChanges: PendingChange[]
  addGrantRole: (userName: string, roleName: string) => void
  addRevokeRole: (userName: string, roleName: string, edgeId: string) => void
  addCreateUser: (details: UserDetails) => void
  addCreateRole: (roleName: string, inheritedRoles: string[], assignedUsers: string[]) => void
  addGrantPrivilege: (roleName: string, databaseName: string, grants: PrivilegeGrant[]) => void
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

    setNodes(nds => {
      const filtered = nds.filter(n => n.id !== 'add-user-button')
      return [
        ...filtered,
        newUserNode,
        {
          id: 'add-user-button',
          type: 'addButton',
          position: { x: LAYOUT.USER_X, y: LAYOUT.START_Y + (userCount + 1) * LAYOUT.ROW_HEIGHT },
          data: { label: 'Add User', type: 'user', onClick: () => {} },
          selectable: false,
          draggable: false,
        },
      ]
    })

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

  const addCreateRole = useCallback((roleName: string, inheritedRoles: string[], assignedUsers: string[]) => {
    const businessRoleCount = nodes.filter(n => n.type === 'role' && n.position.x === LAYOUT.BUSINESS_ROLE_X).length
    const newRoleNode: Node = {
      id: `role-${roleName}`,
      type: 'role',
      position: { x: LAYOUT.BUSINESS_ROLE_X, y: LAYOUT.START_Y + businessRoleCount * LAYOUT.ROW_HEIGHT },
      data: { label: roleName, type: 'business', isSystem: false, isNew: true },
    }

    setNodes(nds => {
      const filtered = nds.filter(n => n.id !== 'add-role-button')
      return [
        ...filtered,
        newRoleNode,
        {
          id: 'add-role-button',
          type: 'addButton',
          position: { x: LAYOUT.BUSINESS_ROLE_X, y: LAYOUT.START_Y + (businessRoleCount + 1) * LAYOUT.ROW_HEIGHT },
          data: { label: 'Add Business Role', type: 'role', onClick: () => {} },
          selectable: false,
          draggable: false,
        },
      ]
    })

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

  const addGrantPrivilege = useCallback((roleName: string, databaseName: string, grants: PrivilegeGrant[]) => {
    const changeId = `priv-${roleName}-${databaseName}-${Date.now()}`

    // Add visual edge from role to database
    setEdges(eds => [
      ...eds,
      {
        id: `privilege-edge-${changeId}`,
        source: `role-${roleName}`,
        target: `db-${databaseName}`,
        animated: true,
        style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 },
      },
    ])

    setPendingChanges(prev => [
      ...prev,
      {
        id: changeId,
        type: 'grant_privilege',
        roleName,
        databaseName,
        privilegeGrants: grants,
      },
    ])
  }, [setEdges])

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
      setNodes(nds => {
        const filtered = nds.filter(n => n.id !== `user-${changeId}`)
        const userCount = filtered.filter(n => n.type === 'user').length
        return filtered.map(n => {
          if (n.id === 'add-user-button') {
            return { ...n, position: { x: LAYOUT.USER_X, y: LAYOUT.START_Y + userCount * LAYOUT.ROW_HEIGHT } }
          }
          return n
        })
      })
      setEdges(eds => eds.filter(e => e.source !== `user-${changeId}`))
    } else if (changeType === 'create_role') {
      setNodes(nds => {
        const filtered = nds.filter(n => n.id !== `role-${changeId}`)
        const businessRoleCount = filtered.filter(n => n.type === 'role' && n.position.x === LAYOUT.BUSINESS_ROLE_X).length
        return filtered.map(n => {
          if (n.id === 'add-role-button') {
            return { ...n, position: { x: LAYOUT.BUSINESS_ROLE_X, y: LAYOUT.START_Y + businessRoleCount * LAYOUT.ROW_HEIGHT } }
          }
          return n
        })
      })
      setEdges(eds => eds.filter(e => e.target !== `role-${changeId}` && e.source !== `role-${changeId}`))
    } else if (changeType === 'grant_privilege') {
      setEdges(eds => eds.filter(e => e.id !== `privilege-edge-${changeId}`))
    }
  }, [setEdges, setNodes])

  const clearAllChanges = useCallback(() => {
    setEdges(eds => {
      const filtered = eds.filter(e => !e.id.startsWith('pending-') && !e.id.startsWith('privilege-edge-'))
      return filtered.map(e => {
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
  }, [setEdges])

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
    removePendingChange,
    clearAllChanges,
    cancelRevoke,
  }
}
