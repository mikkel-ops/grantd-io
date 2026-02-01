import { useState, useCallback, useRef, useEffect } from 'react'
import { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { PlatformGrant } from './useCanvasData'

// Grant details for a database, used for highlighting
export interface DatabaseGrantDetails {
  databaseName: string
  dbPrivileges: string[]
  schemas: {
    name: string
    privileges: string[]
  }[]
}

interface UseDatabaseFocusResult {
  focusedRole: string | null
  focusedRoleGrants: Map<string, DatabaseGrantDetails>
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
  const [focusedRoleGrants, setFocusedRoleGrants] = useState<Map<string, DatabaseGrantDetails>>(new Map())

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
      setFocusedRoleGrants(new Map())
      // Preserve pending edges and restore all base edges when clearing focus
      setEdges(currentEdges => {
        const pendingEdges = currentEdges.filter(e =>
          e.id.startsWith('pending-') ||
          e.id.startsWith('privilege-edge-') ||
          e.id.startsWith('revoke-') ||
          e.id.startsWith('pending-inherit-') ||
          e.id.startsWith('role-edge-new-')
        )
        // Restore ALL base edges including role-db-edge-* (initial role-to-database connections)
        return [...baseEdgesRef.current, ...pendingEdges]
      })
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
        setFocusedRoleGrants(new Map())
        return
      }

      // Aggregate grants by database with detailed schema info
      const dbMap = new Map<string, {
        dbPrivileges: Set<string>
        schemas: Map<string, Set<string>>
      }>()

      for (const grant of roleGrants) {
        // Skip grants without database context
        if (!grant.object_database && grant.object_type === 'WAREHOUSE') {
          continue
        }

        const dbName = grant.object_database || grant.object_name || 'ACCOUNT'
        if (!dbMap.has(dbName)) {
          dbMap.set(dbName, { dbPrivileges: new Set(), schemas: new Map() })
        }
        const entry = dbMap.get(dbName)!

        // Track database-level vs schema-level privileges
        if (grant.object_type === 'DATABASE') {
          entry.dbPrivileges.add(grant.privilege)
        } else if (grant.object_schema) {
          if (!entry.schemas.has(grant.object_schema)) {
            entry.schemas.set(grant.object_schema, new Set())
          }
          entry.schemas.get(grant.object_schema)!.add(grant.privilege)
        }
      }

      console.log('Databases with access:', Array.from(dbMap.keys()))

      // Build grant details map for highlighting
      const grantDetails = new Map<string, DatabaseGrantDetails>()
      for (const [dbName, data] of dbMap) {
        grantDetails.set(dbName, {
          databaseName: dbName,
          dbPrivileges: Array.from(data.dbPrivileges),
          schemas: Array.from(data.schemas.entries()).map(([name, privs]) => ({
            name,
            privileges: Array.from(privs),
          })),
        })
      }
      setFocusedRoleGrants(grantDetails)

      // Create edges from role to existing database nodes
      const dbEdges: Edge[] = []
      for (const [dbName, data] of dbMap) {
        // Check if this database node exists in baseNodes
        const dbNodeId = `db-${dbName}`
        const dbNodeExists = baseNodesRef.current.some(n => n.id === dbNodeId)

        if (dbNodeExists) {
          const schemaCount = data.schemas.size
          const hasDbGrants = data.dbPrivileges.size > 0

          dbEdges.push({
            id: `role-db-edge-${roleName}-${dbName}`,
            source: `role-${roleName}`,
            target: dbNodeId,
            type: 'grantEdge',
            data: {
              schemaCount,
              hasDbGrants,
              dbPrivileges: Array.from(data.dbPrivileges),
            },
            interactionWidth: 20,  // Larger clickable area
            style: { stroke: '#06b6d4', strokeWidth: 2 },
            animated: true,
          })
        }
      }

      console.log('Created edges:', dbEdges.length)

      // Update edges: preserve current edge styling (from lineage effect), just add/update dbEdges
      setEdges(currentEdges => {
        // Create a set of dbEdge IDs we're adding (to avoid duplicates)
        const dbEdgeIds = new Set(dbEdges.map(e => e.id))

        // Keep all current edges EXCEPT ones that will be replaced by new dbEdges
        // This preserves the opacity styling applied by the lineage effect
        const filteredEdges = currentEdges.filter(e => !dbEdgeIds.has(e.id))

        // Add the new dbEdges for the focused role
        return [...filteredEdges, ...dbEdges]
      })
    } catch (error) {
      console.error('Failed to fetch role grants:', error)
    }
  }, [focusedRole, setEdges])

  const clearFocus = useCallback(() => {
    setFocusedRole(null)
    setFocusedRoleGrants(new Map())
    // Restore ALL base edges and preserve pending edges when clearing focus
    setEdges(currentEdges => {
      // Keep pending edges (these should persist)
      const pendingEdges = currentEdges.filter(e =>
        e.id.startsWith('pending-') ||
        e.id.startsWith('privilege-edge-') ||
        e.id.startsWith('revoke-') ||
        e.id.startsWith('pending-inherit-') ||
        e.id.startsWith('role-edge-new-')
      )
      // Restore ALL base edges including role-db-edge-* (initial role-to-database connections)
      return [...baseEdgesRef.current, ...pendingEdges]
    })
  }, [setEdges])

  return {
    focusedRole,
    focusedRoleGrants,
    focusOnRole,
    clearFocus,
  }
}
