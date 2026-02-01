import { useState, useCallback, useRef, useEffect } from 'react'
import { Node } from '@xyflow/react'
import { api } from '@/lib/api'

const SCHEMA_ROW_HEIGHT = 92  // Each schema card height
const SCHEMAS_HEADER_HEIGHT = 30
const SCHEMAS_PADDING = 24
const DB_PRIVILEGES_SECTION_HEIGHT = 98  // "Database Privileges" header + privilege chips row + padding

interface SchemaInfo {
  name: string
  fullName: string
}

interface DatabaseSchemas {
  [databaseName: string]: SchemaInfo[]
}

interface UseDatabaseExpansionResult {
  expandedDatabase: string | null
  toggleDatabase: (databaseName: string, connectionId: string, token: string) => Promise<void>
  expandDatabase: (databaseName: string, connectionId: string, token: string) => Promise<void>
  collapseDatabase: () => void
  isLoading: boolean
}

export function useDatabaseExpansion(
  _baseNodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
): UseDatabaseExpansionResult {
  const [expandedDatabase, setExpandedDatabase] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const schemaCache = useRef<DatabaseSchemas>({})
  // Store the original Y positions before any expansion
  const originalYPositions = useRef<Map<string, number>>(new Map())
  // Ref to always have the current expanded database value (avoids stale closures)
  const expandedDatabaseRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    expandedDatabaseRef.current = expandedDatabase
  }, [expandedDatabase])

  const expandDatabase = useCallback(async (
    databaseName: string,
    connectionId: string,
    token: string
  ) => {
    // Don't re-expand same database (use ref to avoid stale closure)
    if (expandedDatabaseRef.current === databaseName) return

    setIsLoading(true)
    // Update both state and ref synchronously
    setExpandedDatabase(databaseName)
    expandedDatabaseRef.current = databaseName

    try {
      // Check cache first
      let schemas = schemaCache.current[databaseName]

      if (!schemas) {
        // Fetch schemas for this database from the dedicated endpoint
        const schemaResponse = await api.get<{ name: string; full_name: string }[]>(
          `/objects/databases/${encodeURIComponent(databaseName)}/schemas?connection_id=${connectionId}`,
          token
        )

        schemas = (schemaResponse || []).map(s => ({
          name: s.name,
          fullName: s.full_name,
        }))

        // Cache the results
        schemaCache.current[databaseName] = schemas
      }

      const dbNodeId = `db-${databaseName}`

      // Calculate the height increase needed for schemas and DB privileges section
      const expansionHeight = schemas.length > 0
        ? DB_PRIVILEGES_SECTION_HEIGHT + (schemas.length * SCHEMA_ROW_HEIGHT) + SCHEMAS_HEADER_HEIGHT + SCHEMAS_PADDING
        : 0

      // Update nodes: modify the database node to include schemas and push down others
      setNodes(nds => {
        // Find the target database node from current nodes
        const dbNode = nds.find(n => n.id === dbNodeId)
        if (!dbNode) return nds

        // Get all database nodes and sort by Y position
        const dbNodes = nds.filter(n => n.id.startsWith('db-'))
        const sortedDbNodes = [...dbNodes].sort((a, b) => a.position.y - b.position.y)

        // Find the index of our target database
        const targetIndex = sortedDbNodes.findIndex(n => n.id === dbNodeId)

        // Save original positions for ALL database nodes if not already saved
        // This preserves the initial layout positions
        for (const n of sortedDbNodes) {
          if (!originalYPositions.current.has(n.id)) {
            originalYPositions.current.set(n.id, n.position.y)
          }
        }

        const updatedNodes = nds
          .filter(n => !n.id.startsWith('schema-')) // Remove any standalone schema nodes
          .map(n => {
            // Update the target database node to show schemas
            if (n.id === dbNodeId) {
              // Preserve pendingPrivilegeChanges from the current node data
              // This is critical - without this, pending grants won't show as highlighted
              const existingPendingChanges = (n.data as { pendingPrivilegeChanges?: unknown }).pendingPrivilegeChanges
              return {
                ...n,
                type: 'databaseGroup',
                data: {
                  ...n.data,
                  isExpanded: true,
                  schemas: schemas,
                  // Explicitly preserve pending changes - spreading n.data should do this,
                  // but we're being explicit to avoid any potential override issues
                  pendingPrivilegeChanges: existingPendingChanges,
                },
              }
            }

            // Handle other database nodes (not the one being expanded)
            if (n.id.startsWith('db-') && n.id !== dbNodeId) {
              const nodeIndex = sortedDbNodes.findIndex(sn => sn.id === n.id)
              const shouldPushDown = nodeIndex > targetIndex
              const wasExpanded = n.type === 'databaseGroup' && (n.data as { isExpanded?: boolean }).isExpanded

              // Build the updated node - may need to collapse AND push down
              let updatedNode = n

              // Collapse if it was expanded
              if (wasExpanded) {
                updatedNode = {
                  ...updatedNode,
                  type: 'databaseGroup',
                  data: {
                    ...updatedNode.data,
                    isExpanded: false,
                    schemas: [],
                  },
                }
              }

              // Push down if below the expanded database
              if (shouldPushDown) {
                const originalY = originalYPositions.current.get(n.id) ?? n.position.y
                updatedNode = {
                  ...updatedNode,
                  position: {
                    x: updatedNode.position.x,
                    y: originalY + expansionHeight,
                  },
                }
              }

              return updatedNode
            }
            return n
          })

        return updatedNodes
      })
    } catch (error) {
      console.error('Failed to load schemas:', error)
    } finally {
      setIsLoading(false)
    }
  }, [setNodes])

  const collapseDatabase = useCallback(() => {
    const prevExpanded = expandedDatabaseRef.current
    // Update both state and ref synchronously
    setExpandedDatabase(null)
    expandedDatabaseRef.current = null

    // Remove schema nodes and restore original database positions
    setNodes(nds => {
      return nds
        .filter(n => !n.id.startsWith('schema-'))
        .map(n => {
          // Collapse the expanded database node
          if (n.type === 'databaseGroup' && n.id === `db-${prevExpanded}`) {
            return {
              ...n,
              data: {
                ...n.data,
                isExpanded: false,
                schemas: [],
              },
            }
          }

          // Restore original positions for database nodes
          // Check both by type AND by id prefix to catch all database nodes
          if (n.type === 'database' || n.type === 'databaseGroup' || n.id.startsWith('db-')) {
            const originalY = originalYPositions.current.get(n.id)
            if (originalY !== undefined) {
              return {
                ...n,
                position: {
                  x: n.position.x,
                  y: originalY,
                },
              }
            }
          }
          return n
        })
    })
  }, [setNodes])

  // Toggle function for click-based expand/collapse
  // Uses ref to avoid stale closure issues with expandedDatabase
  const toggleDatabase = useCallback(async (
    databaseName: string,
    connectionId: string,
    token: string
  ) => {
    // Use ref to get current value (avoids stale closure)
    const currentExpanded = expandedDatabaseRef.current

    if (currentExpanded === databaseName) {
      collapseDatabase()
    } else {
      // If another database is expanded, collapse it first
      if (currentExpanded) {
        collapseDatabase()
        // Small delay to let the collapse complete
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      await expandDatabase(databaseName, connectionId, token)
    }
  }, [expandDatabase, collapseDatabase])

  return {
    expandedDatabase,
    toggleDatabase,
    expandDatabase,
    collapseDatabase,
    isLoading,
  }
}
