import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { Node, Edge } from '@xyflow/react'
import { useDatabaseFocus } from './useDatabaseFocus'

// Mock the API module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/lib/api'

describe('useDatabaseFocus', () => {
  let mockNodes: Node[]
  let mockEdges: Edge[]
  let setNodesMock: ReturnType<typeof vi.fn>
  let setEdgesMock: ReturnType<typeof vi.fn>
  const mockToken = 'test-token'
  const mockConnectionId = 'test-connection-id'

  beforeEach(() => {
    mockNodes = [
      { id: 'role-TEST_ROLE', type: 'role', position: { x: 200, y: 0 }, data: { label: 'TEST_ROLE' } },
      { id: 'role-OTHER_ROLE', type: 'role', position: { x: 200, y: 100 }, data: { label: 'OTHER_ROLE' } },
      { id: 'db-TEST_DB', type: 'database', position: { x: 400, y: 0 }, data: { label: 'TEST_DB' } },
      { id: 'db-OTHER_DB', type: 'database', position: { x: 400, y: 100 }, data: { label: 'OTHER_DB' } },
    ]
    mockEdges = [
      { id: 'role-db-edge-TEST_ROLE-TEST_DB', source: 'role-TEST_ROLE', target: 'db-TEST_DB' },
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initial state', () => {
    it('should have no focused role initially', () => {
      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      expect(result.current.focusedRole).toBeNull()
      expect(result.current.focusedRoleGrants.size).toBe(0)
    })
  })

  describe('focusOnRole', () => {
    it('should set focused role and fetch grants', async () => {
      const mockGrants = [
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_DB',
        },
      ]

      vi.mocked(api.get).mockResolvedValue(mockGrants)

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRole).toBe('TEST_ROLE')
      })

      expect(api.get).toHaveBeenCalledWith(
        `/objects/grants?connection_id=${mockConnectionId}&grantee_name=TEST_ROLE&limit=500`,
        mockToken
      )
    })

    it('should aggregate grants by database', async () => {
      const mockGrants = [
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_DB',
        },
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'MONITOR',
          object_schema: null,
          object_name: 'TEST_DB',
        },
        {
          object_database: 'TEST_DB',
          object_type: 'SCHEMA',
          privilege: 'CREATE TABLE',
          object_schema: 'PUBLIC',
          object_name: 'PUBLIC',
        },
      ]

      vi.mocked(api.get).mockResolvedValue(mockGrants)

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRoleGrants.size).toBeGreaterThan(0)
      })

      const grantDetails = result.current.focusedRoleGrants.get('TEST_DB')
      expect(grantDetails).toBeDefined()
      expect(grantDetails?.dbPrivileges).toContain('USAGE')
      expect(grantDetails?.dbPrivileges).toContain('MONITOR')
      expect(grantDetails?.schemas).toHaveLength(1)
      expect(grantDetails?.schemas?.[0]?.name).toBe('PUBLIC')
    })

    it('should toggle off when same role is focused again', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      // Focus on a role
      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRole).toBe('TEST_ROLE')
      })

      // Focus on same role again - should toggle off
      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      expect(result.current.focusedRole).toBeNull()
      expect(result.current.focusedRoleGrants.size).toBe(0)
    })

    it('should handle empty grants response', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRole).toBe('TEST_ROLE')
      })

      expect(result.current.focusedRoleGrants.size).toBe(0)
    })

    it('should skip warehouse grants without database context', async () => {
      const mockGrants = [
        {
          object_database: null,
          object_type: 'WAREHOUSE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_WAREHOUSE',
        },
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_DB',
        },
      ]

      vi.mocked(api.get).mockResolvedValue(mockGrants)

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRoleGrants.size).toBe(1)
      })

      // Only TEST_DB should be in grants, not the warehouse
      expect(result.current.focusedRoleGrants.has('TEST_DB')).toBe(true)
      expect(result.current.focusedRoleGrants.has('TEST_WAREHOUSE')).toBe(false)
    })

    it('should create edges from role to database nodes', async () => {
      const mockGrants = [
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_DB',
        },
      ]

      vi.mocked(api.get).mockResolvedValue(mockGrants)

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(setEdgesMock).toHaveBeenCalled()
      })
    })

    it('should handle API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(api.get).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch role grants:', expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('clearFocus', () => {
    it('should clear focused role and grants', async () => {
      vi.mocked(api.get).mockResolvedValue([
        {
          object_database: 'TEST_DB',
          object_type: 'DATABASE',
          privilege: 'USAGE',
          object_schema: null,
          object_name: 'TEST_DB',
        },
      ])

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.focusedRole).toBe('TEST_ROLE')
      })

      act(() => {
        result.current.clearFocus()
      })

      expect(result.current.focusedRole).toBeNull()
      expect(result.current.focusedRoleGrants.size).toBe(0)
    })

    it('should preserve pending edges when clearing focus', async () => {
      mockEdges = [
        { id: 'pending-test-edge', source: 'role-TEST_ROLE', target: 'db-TEST_DB' },
        { id: 'role-db-edge-TEST_ROLE-TEST_DB', source: 'role-TEST_ROLE', target: 'db-TEST_DB' },
      ]

      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseFocus(mockNodes, mockEdges, setNodesMock, setEdgesMock)
      )

      await act(async () => {
        result.current.focusOnRole('TEST_ROLE', mockConnectionId, mockToken)
      })

      act(() => {
        result.current.clearFocus()
      })

      expect(setEdgesMock).toHaveBeenCalled()
    })
  })
})
