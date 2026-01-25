import { useState, useCallback, useRef, useEffect } from 'react'
import { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { PlatformGrant } from './useCanvasData'

interface UseDatabaseFocusResult {
  focusedRole: string | null
  focusOnRole: (roleName: string, connectionId: string, token: string) => void
  clearFocus: () => void
}

export function useDatabaseFocus(
  baseNodes: Node[],
  baseEdges: Edge[],
  _setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
): UseDatabaseFocusResult {
  const [focusedRole, setFocusedRole] = useState<string | null>(null)

  // Use refs to avoid stale closure issues
  const baseNodesRef = useRef<Node[]>(baseNodes)
  const baseEdgesRef = useRef<Edge[]>(baseEdges)

  // Keep refs in sync
  useEffect(() => {
    baseNodesRef.current = baseNodes
    baseEdgesRef.current = baseEdges
  }, [baseNodes, baseEdges])

  const focusOnRole = useCallback(async (roleName: string, connectionId: string, token: string) => {
    // Check if toggling off
    if (focusedRole === roleName) {
      setFocusedRole(null)
      setEdges(baseEdgesRef.current)
      return
    }

    setFocusedRole(roleName)

    try {
      // Fetch grants specifically for this role from the API
      const roleGrants = await api.get<PlatformGrant[]>(
        `/objects/grants?connection_id=${connectionId}&grantee_name=${roleName}&limit=500`,
        token
      )

      console.log('Fetched grants for role:', roleName, roleGrants?.length || 0)

      if (!roleGrants || roleGrants.length === 0) {
        console.log('No grants found for this role')
        return
      }

      // Aggregate grants by database
      const dbMap = new Map<string, { schemas: Set<string>; privileges: Set<string> }>()

      for (const grant of roleGrants) {
        // Skip grants without database context
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

      console.log('Databases with access:', Array.from(dbMap.keys()))

      // Create edges from role to existing database nodes
      const dbEdges: Edge[] = []
      for (const [dbName] of dbMap) {
        // Check if this database node exists in baseNodes
        const dbNodeId = `db-${dbName}`
        const dbNodeExists = baseNodesRef.current.some(n => n.id === dbNodeId)

        if (dbNodeExists) {
          dbEdges.push({
            id: `role-db-edge-${roleName}-${dbName}`,
            source: `role-${roleName}`,
            target: dbNodeId,
            style: { stroke: '#06b6d4', strokeWidth: 2 },
            animated: true,
          })
        }
      }

      console.log('Created edges:', dbEdges.length)

      // Update edges to show connections
      setEdges([...baseEdgesRef.current, ...dbEdges])
    } catch (error) {
      console.error('Failed to fetch role grants:', error)
    }
  }, [focusedRole, setEdges])

  const clearFocus = useCallback(() => {
    setFocusedRole(null)
    setEdges(baseEdgesRef.current)
  }, [setEdges])

  return {
    focusedRole,
    focusOnRole,
    clearFocus,
  }
}
