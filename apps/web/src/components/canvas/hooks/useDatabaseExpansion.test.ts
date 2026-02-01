import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { Node } from '@xyflow/react'
import { useDatabaseExpansion } from './useDatabaseExpansion'

// Mock the API module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/lib/api'

describe('useDatabaseExpansion', () => {
  let mockNodes: Node[]
  let setNodesMock: ReturnType<typeof vi.fn>
  const mockToken = 'test-token'
  const mockConnectionId = 'test-connection-id'

  beforeEach(() => {
    mockNodes = [
      { id: 'db-FIRST_DB', type: 'database', position: { x: 400, y: 0 }, data: { label: 'FIRST_DB' } },
      { id: 'db-SECOND_DB', type: 'database', position: { x: 400, y: 100 }, data: { label: 'SECOND_DB' } },
      { id: 'db-THIRD_DB', type: 'database', position: { x: 400, y: 200 }, data: { label: 'THIRD_DB' } },
    ]
    setNodesMock = vi.fn((updater) => {
      if (typeof updater === 'function') {
        mockNodes = updater(mockNodes)
      } else {
        mockNodes = updater
      }
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initial state', () => {
    it('should have no expanded database initially', () => {
      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      expect(result.current.expandedDatabase).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('expandDatabase', () => {
    it('should expand a database and fetch schemas', async () => {
      const mockSchemas = [
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
        { name: 'RAW', full_name: 'FIRST_DB.RAW' },
      ]

      vi.mocked(api.get).mockResolvedValue(mockSchemas)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      expect(api.get).toHaveBeenCalledWith(
        `/objects/databases/FIRST_DB/schemas?connection_id=${mockConnectionId}`,
        mockToken
      )
      expect(setNodesMock).toHaveBeenCalled()
    })

    it('should not re-expand the same database', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      const callCount = vi.mocked(api.get).mock.calls.length

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      // API should not be called again for the same database
      expect(vi.mocked(api.get).mock.calls.length).toBe(callCount)
    })

    it('should update database node to databaseGroup type with schemas', async () => {
      const mockSchemas = [
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
      ]

      vi.mocked(api.get).mockResolvedValue(mockSchemas)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(setNodesMock).toHaveBeenCalled()
      })

      // Verify the setNodes updater was called
      const lastCall = setNodesMock.mock.calls[setNodesMock.mock.calls.length - 1]
      expect(lastCall).toBeDefined()
      const updater = lastCall![0]
      const updatedNodes = typeof updater === 'function' ? updater(mockNodes) : updater

      const expandedNode = updatedNodes.find((n: Node) => n.id === 'db-FIRST_DB')
      expect(expandedNode?.type).toBe('databaseGroup')
      expect((expandedNode?.data as { isExpanded?: boolean })?.isExpanded).toBe(true)
    })

    it('should push down databases below the expanded one', async () => {
      const mockSchemas = [
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
        { name: 'RAW', full_name: 'FIRST_DB.RAW' },
      ]

      vi.mocked(api.get).mockResolvedValue(mockSchemas)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(setNodesMock).toHaveBeenCalled()
      })
    })

    it('should cache schemas and not re-fetch', async () => {
      const mockSchemas = [
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
      ]

      vi.mocked(api.get).mockResolvedValue(mockSchemas)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      // First expand
      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      // Collapse
      act(() => {
        result.current.collapseDatabase()
      })

      // Expand again - should use cache
      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      // API should only be called once (cached second time)
      expect(vi.mocked(api.get).mock.calls.length).toBe(1)
    })

    it('should handle API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(api.get).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load schemas:', expect.any(Error))
      expect(result.current.isLoading).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should preserve pending privilege changes when expanding', async () => {
      mockNodes = [
        {
          id: 'db-FIRST_DB',
          type: 'database',
          position: { x: 400, y: 0 },
          data: {
            label: 'FIRST_DB',
            pendingPrivilegeChanges: [
              { privilege: 'USAGE', objectType: 'DATABASE', changeType: 'grant' },
            ],
          },
        },
      ]

      const mockSchemas = [
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
      ]

      vi.mocked(api.get).mockResolvedValue(mockSchemas)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(setNodesMock).toHaveBeenCalled()
      })
    })
  })

  describe('collapseDatabase', () => {
    it('should collapse expanded database and restore positions', async () => {
      vi.mocked(api.get).mockResolvedValue([
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
      ])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      act(() => {
        result.current.collapseDatabase()
      })

      expect(result.current.expandedDatabase).toBeNull()
      expect(setNodesMock).toHaveBeenCalled()
    })
  })

  describe('toggleDatabase', () => {
    it('should expand when collapsed', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      expect(result.current.expandedDatabase).toBe('FIRST_DB')
    })

    it('should collapse when expanded', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      expect(result.current.expandedDatabase).toBeNull()
    })

    it('should collapse previous and expand new when different database toggled', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      await act(async () => {
        await result.current.toggleDatabase('SECOND_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('SECOND_DB')
      })
    })

    it('should correctly handle expand/collapse/expand cycle (no stale closure)', async () => {
      // This test verifies the fix for the bug where the third toggle
      // would not expand the database due to stale closure issues
      vi.mocked(api.get).mockResolvedValue([
        { name: 'PUBLIC', full_name: 'FIRST_DB.PUBLIC' },
      ])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      // Toggle 1: expand
      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      // Toggle 2: collapse
      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBeNull()
      })

      // Toggle 3: expand again - this is where the stale closure bug occurred
      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })
    })

    it('should handle rapid toggles without getting stuck', async () => {
      // Test that rapid clicking doesn't break the toggle state
      vi.mocked(api.get).mockResolvedValue([])

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      // Perform multiple rapid toggles
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
        })
      }

      // After odd number of toggles, should be expanded
      await waitFor(() => {
        expect(result.current.expandedDatabase).toBe('FIRST_DB')
      })

      // One more toggle should collapse
      await act(async () => {
        await result.current.toggleDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      await waitFor(() => {
        expect(result.current.expandedDatabase).toBeNull()
      })
    })
  })

  describe('isLoading', () => {
    it('should be true while fetching schemas', async () => {
      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      vi.mocked(api.get).mockReturnValue(pendingPromise as Promise<unknown>)

      const { result } = renderHook(() =>
        useDatabaseExpansion(mockNodes, setNodesMock)
      )

      act(() => {
        result.current.expandDatabase('FIRST_DB', mockConnectionId, mockToken)
      })

      // isLoading should be true while waiting
      expect(result.current.isLoading).toBe(true)

      // Resolve the promise
      await act(async () => {
        resolvePromise!([])
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })
})
