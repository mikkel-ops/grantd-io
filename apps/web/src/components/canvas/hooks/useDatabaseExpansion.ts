import { useState, useCallback, useRef } from 'react'
import { Node } from '@xyflow/react'
import { api } from '@/lib/api'

const SCHEMA_ROW_HEIGHT = 40
const SCHEMAS_HEADER_HEIGHT = 24
const SCHEMAS_PADDING = 12

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

  const expandDatabase = useCallback(async (
    databaseName: string,
    connectionId: string,
    token: string
  ) => {
    // Don't re-expand same database
    if (expandedDatabase === databaseName) return

    setIsLoading(true)
    setExpandedDatabase(databaseName)

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

      // Calculate the height increase needed for schemas
      const expansionHeight = schemas.length > 0
        ? (schemas.length * SCHEMA_ROW_HEIGHT) + SCHEMAS_HEADER_HEIGHT + SCHEMAS_PADDING
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
        const expandedDbY = dbNode.position.y

        // Save original positions for ALL database nodes if not already saved
        // This preserves the initial layout positions
        for (const n of sortedDbNodes) {
          if (!originalYPositions.current.has(n.id)) {
            originalYPositions.current.set(n.id, n.position.y)
          }
        }

        console.log('Expanding database:', databaseName, 'at Y:', expandedDbY, 'expansion height:', expansionHeight)
        console.log('Target index:', targetIndex, 'of', sortedDbNodes.length, 'databases')

        const updatedNodes = nds
          .filter(n => !n.id.startsWith('schema-')) // Remove any standalone schema nodes
          .map(n => {
            // Update the target database node to show schemas
            if (n.id === dbNodeId) {
              return {
                ...n,
                type: 'databaseGroup',
                data: {
                  ...n.data,
                  isExpanded: true,
                  schemas: schemas,
                },
              }
            }

            // Collapse any other previously expanded database
            if (n.type === 'databaseGroup' && n.id !== dbNodeId && (n.data as { isExpanded?: boolean }).isExpanded) {
              return {
                ...n,
                type: 'databaseGroup',
                data: {
                  ...n.data,
                  isExpanded: false,
                  schemas: [],
                },
              }
            }

            // Push down database nodes that are below the expanded database
            if (n.id.startsWith('db-') && n.id !== dbNodeId) {
              // Check if this database is below the expanded one in the sorted order
              const nodeIndex = sortedDbNodes.findIndex(sn => sn.id === n.id)
              if (nodeIndex > targetIndex) {
                const originalY = originalYPositions.current.get(n.id) ?? n.position.y
                console.log('Pushing down:', n.id, 'from', n.position.y, 'to', originalY + expansionHeight)
                return {
                  ...n,
                  position: {
                    x: n.position.x,
                    y: originalY + expansionHeight,
                  },
                }
              }
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
  }, [expandedDatabase, setNodes])

  const collapseDatabase = useCallback(() => {
    const prevExpanded = expandedDatabase
    setExpandedDatabase(null)

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
  }, [expandedDatabase, setNodes])

  // Toggle function for click-based expand/collapse
  const toggleDatabase = useCallback(async (
    databaseName: string,
    connectionId: string,
    token: string
  ) => {
    if (expandedDatabase === databaseName) {
      collapseDatabase()
    } else {
      // If another database is expanded, collapse it first
      if (expandedDatabase) {
        collapseDatabase()
        // Small delay to let the collapse complete
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      await expandDatabase(databaseName, connectionId, token)
    }
  }, [expandedDatabase, expandDatabase, collapseDatabase])

  return {
    expandedDatabase,
    toggleDatabase,
    expandDatabase,
    collapseDatabase,
    isLoading,
  }
}
