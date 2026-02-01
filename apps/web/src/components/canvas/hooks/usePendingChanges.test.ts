import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Node, Edge } from '@xyflow/react'
import { usePendingChanges } from './usePendingChanges'
import { UserDetails } from '../AddUserModal'

// Helper to create a valid UserDetails object for tests
const createTestUserDetails = (userName: string, email: string): UserDetails => ({
  userName,
  email,
  password: null,
  confirmPassword: null,
  comment: null,
  mustChangePassword: false,
  loginName: null,
  displayName: null,
  firstName: null,
  lastName: null,
  defaultNamespace: null,
})

describe('usePendingChanges', () => {
  let mockNodes: Node[]
  let mockEdges: Edge[]
  let setNodesMock: ReturnType<typeof vi.fn>
  let setEdgesMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockNodes = [
      { id: 'user-test_user', type: 'user', position: { x: 0, y: 0 }, data: { label: 'test_user' } },
      { id: 'role-TEST_ROLE', type: 'role', position: { x: 200, y: 0 }, data: { label: 'TEST_ROLE' } },
      { id: 'db-TEST_DB', type: 'database', position: { x: 400, y: 0 }, data: { label: 'TEST_DB' } },
    ]
    mockEdges = [
      { id: 'edge-user-role', source: 'user-test_user', target: 'role-TEST_ROLE' },
    ]
    setNodesMock = vi.fn((updater) => {
      if (typeof updater === 'function') {
        mockNodes = updater(mockNodes)
      } else {
        mockNodes = updater
      }
    })
    setEdgesMock = vi.fn((updater) => {
      if (typeof updater === 'function') {
        mockEdges = updater(mockEdges)
      } else {
        mockEdges = updater
      }
    })
  })

  describe('addGrantRole', () => {
    it('should add a grant_role pending change', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addGrantRole('test_user', 'NEW_ROLE')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toEqual({
        id: 'test_user-NEW_ROLE',
        type: 'grant_role',
        userName: 'test_user',
        roleName: 'NEW_ROLE',
      })
    })

    it('should allow multiple grant_role changes', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addGrantRole('user1', 'ROLE_A')
        result.current.addGrantRole('user2', 'ROLE_B')
      })

      expect(result.current.pendingChanges).toHaveLength(2)
    })
  })

  describe('addRevokeRole', () => {
    it('should add a revoke_role pending change and update edge style', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addRevokeRole('test_user', 'TEST_ROLE', 'edge-user-role')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'revoke_role',
        userName: 'test_user',
        roleName: 'TEST_ROLE',
      })
      expect(setEdgesMock).toHaveBeenCalled()
    })

    it('should not add duplicate revoke changes', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addRevokeRole('test_user', 'TEST_ROLE', 'edge-user-role')
      })

      act(() => {
        result.current.addRevokeRole('test_user', 'TEST_ROLE', 'edge-user-role')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
    })
  })

  describe('addCreateUser', () => {
    it('should add a create_user pending change and create new node', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      const userDetails = createTestUserDetails('new_user', 'new@example.com')

      act(() => {
        result.current.addCreateUser(userDetails)
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'create_user',
        userName: 'new_user',
        userDetails,
      })
      expect(setNodesMock).toHaveBeenCalled()
    })
  })

  describe('addCreateRole', () => {
    it('should add a create_role pending change and create new node', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addCreateRole('NEW_ROLE', [], [], 'business')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'create_role',
        roleName: 'NEW_ROLE',
      })
      expect(setNodesMock).toHaveBeenCalled()
    })

    it('should create edges for inherited roles', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addCreateRole('CHILD_ROLE', ['PARENT_ROLE'], [], 'business')
      })

      expect(setEdgesMock).toHaveBeenCalled()
    })

    it('should create edges for assigned users', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addCreateRole('NEW_ROLE', [], ['test_user'], 'business')
      })

      expect(setEdgesMock).toHaveBeenCalled()
    })
  })

  describe('addInheritRole', () => {
    it('should add an inherit_role pending change and create edge', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addInheritRole('PARENT_ROLE', 'CHILD_ROLE')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'inherit_role',
        parentRoleName: 'PARENT_ROLE',
        childRoleName: 'CHILD_ROLE',
      })
      expect(setEdgesMock).toHaveBeenCalled()
    })

    it('should not add duplicate inherit changes', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addInheritRole('PARENT_ROLE', 'CHILD_ROLE')
      })

      act(() => {
        result.current.addInheritRole('PARENT_ROLE', 'CHILD_ROLE')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
    })
  })

  describe('addRevokeDbAccess', () => {
    it('should add a revoke_db_access pending change', () => {
      mockEdges = [
        { id: 'role-db-edge-TEST_ROLE-TEST_DB', source: 'role-TEST_ROLE', target: 'db-TEST_DB' },
      ]

      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addRevokeDbAccess('TEST_ROLE', 'TEST_DB', 'role-db-edge-TEST_ROLE-TEST_DB')
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'revoke_db_access',
        roleName: 'TEST_ROLE',
        databaseName: 'TEST_DB',
      })
      expect(setEdgesMock).toHaveBeenCalled()
    })
  })

  describe('addGrantPrivilege', () => {
    it('should add grant_privilege pending changes', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      const grants = [
        { privilege: 'USAGE', objectType: 'DATABASE' as const, objectName: 'TEST_DB' },
      ]

      act(() => {
        result.current.addGrantPrivilege('TEST_ROLE', 'TEST_DB', grants)
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'grant_privilege',
        roleName: 'TEST_ROLE',
        databaseName: 'TEST_DB',
        privilege: 'USAGE',
      })
      expect(setNodesMock).toHaveBeenCalled()
      expect(setEdgesMock).toHaveBeenCalled()
    })
  })

  describe('togglePrivilege', () => {
    it('should add a grant when privilege is not currently granted', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.togglePrivilege('TEST_ROLE', 'TEST_DB', 'USAGE', 'DATABASE', undefined, false)
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'grant_privilege',
        privilege: 'USAGE',
      })
    })

    it('should add a revoke when privilege is currently granted', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.togglePrivilege('TEST_ROLE', 'TEST_DB', 'USAGE', 'DATABASE', undefined, true)
      })

      expect(result.current.pendingChanges).toHaveLength(1)
      expect(result.current.pendingChanges[0]).toMatchObject({
        type: 'revoke_privilege',
        privilege: 'USAGE',
      })
    })

    it('should remove pending change when toggled again', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.togglePrivilege('TEST_ROLE', 'TEST_DB', 'USAGE', 'DATABASE', undefined, false)
      })

      expect(result.current.pendingChanges).toHaveLength(1)

      act(() => {
        result.current.togglePrivilege('TEST_ROLE', 'TEST_DB', 'USAGE', 'DATABASE', undefined, false)
      })

      expect(result.current.pendingChanges).toHaveLength(0)
    })
  })

  describe('removePendingChange', () => {
    it('should remove a grant_role change and clean up edges', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addGrantRole('test_user', 'NEW_ROLE')
      })

      expect(result.current.pendingChanges).toHaveLength(1)

      act(() => {
        result.current.removePendingChange('test_user-NEW_ROLE', 'grant_role')
      })

      expect(result.current.pendingChanges).toHaveLength(0)
      expect(setEdgesMock).toHaveBeenCalled()
    })

    it('should remove a create_user change and clean up nodes/edges', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addCreateUser(createTestUserDetails('new_user', 'new@example.com'))
      })

      act(() => {
        result.current.removePendingChange('new_user', 'create_user')
      })

      expect(result.current.pendingChanges).toHaveLength(0)
      expect(setNodesMock).toHaveBeenCalled()
    })
  })

  describe('clearAllChanges', () => {
    it('should clear all pending changes', () => {
      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addGrantRole('user1', 'ROLE_A')
        result.current.addGrantRole('user2', 'ROLE_B')
      })

      expect(result.current.pendingChanges).toHaveLength(2)

      act(() => {
        result.current.clearAllChanges()
      })

      expect(result.current.pendingChanges).toHaveLength(0)
      expect(setEdgesMock).toHaveBeenCalled()
    })
  })

  describe('cancelRevoke', () => {
    it('should cancel a revoke and restore edge style', () => {
      mockEdges = [
        { id: 'edge-user-role', source: 'user-test_user', target: 'role-TEST_ROLE' },
      ]

      const { result } = renderHook(() =>
        usePendingChanges(mockNodes, setNodesMock, mockEdges, setEdgesMock)
      )

      act(() => {
        result.current.addRevokeRole('test_user', 'TEST_ROLE', 'edge-user-role')
      })

      expect(result.current.pendingChanges).toHaveLength(1)

      act(() => {
        result.current.cancelRevoke('test_user-TEST_ROLE')
      })

      expect(result.current.pendingChanges).toHaveLength(0)
      expect(setEdgesMock).toHaveBeenCalled()
    })
  })
})
