import { useState, useEffect } from 'react'
import { Database, Folder, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'

// Snowflake privileges by object level
const SNOWFLAKE_PRIVILEGES = {
  DATABASE: ['USAGE', 'MONITOR', 'CREATE SCHEMA'],
  SCHEMA: ['USAGE', 'MONITOR', 'CREATE TABLE', 'CREATE VIEW', 'CREATE STAGE', 'CREATE FILE FORMAT', 'CREATE SEQUENCE', 'CREATE FUNCTION', 'CREATE PROCEDURE'],
} as const

export interface PrivilegeGrant {
  privilege: string
  objectType: 'DATABASE' | 'SCHEMA'
  objectName: string // e.g., "MY_DB" or "MY_DB.MY_SCHEMA"
}

interface SchemaInfo {
  name: string
  fullName: string // DB.SCHEMA format
}

interface GrantPrivilegesModalProps {
  connectionId: string
  roleName: string
  databaseName: string
  onClose: () => void
  onGrantsSelected: (grants: PrivilegeGrant[]) => void
}

export default function GrantPrivilegesModal({
  connectionId,
  roleName,
  databaseName,
  onClose,
  onGrantsSelected,
}: GrantPrivilegesModalProps) {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [schemas, setSchemas] = useState<SchemaInfo[]>([])
  const [selectedLevel, setSelectedLevel] = useState<'database' | 'schema'>('database')
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
  const [selectedPrivileges, setSelectedPrivileges] = useState<Set<string>>(new Set())

  // Load schemas for this database
  useEffect(() => {
    const loadSchemas = async () => {
      try {
        const token = await getToken()
        if (!token) return

        // Get schemas from grants (unique schemas in this database)
        const grants = await api.get<{ object_schema: string | null }[]>(
          `/objects/grants?connection_id=${connectionId}&limit=500`,
          token
        )

        const schemaSet = new Set<string>()
        for (const grant of grants || []) {
          if (grant.object_schema) {
            schemaSet.add(grant.object_schema)
          }
        }

        const schemaList = Array.from(schemaSet)
          .sort()
          .map(name => ({
            name,
            fullName: `${databaseName}.${name}`,
          }))

        setSchemas(schemaList)
      } catch (error) {
        console.error('Failed to load schemas:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSchemas()
  }, [connectionId, databaseName, getToken])

  const togglePrivilege = (privilege: string) => {
    setSelectedPrivileges(prev => {
      const next = new Set(prev)
      if (next.has(privilege)) {
        next.delete(privilege)
      } else {
        next.add(privilege)
      }
      return next
    })
  }

  const handleConfirm = () => {
    const grants: PrivilegeGrant[] = []

    if (selectedLevel === 'database') {
      for (const privilege of selectedPrivileges) {
        grants.push({
          privilege,
          objectType: 'DATABASE',
          objectName: databaseName,
        })
      }
    } else if (selectedSchema) {
      for (const privilege of selectedPrivileges) {
        grants.push({
          privilege,
          objectType: 'SCHEMA',
          objectName: selectedSchema,
        })
      }
    }

    if (grants.length > 0) {
      onGrantsSelected(grants)
    }
    onClose()
  }

  const availablePrivileges = selectedLevel === 'database'
    ? SNOWFLAKE_PRIVILEGES.DATABASE
    : SNOWFLAKE_PRIVILEGES.SCHEMA

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-lg m-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-cyan-600" />
              Grant Privileges
            </h2>
            <p className="text-sm text-muted-foreground">
              {roleName} → {databaseName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Level Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Grant Level</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedLevel('database')
                      setSelectedSchema(null)
                      setSelectedPrivileges(new Set())
                    }}
                    className={`flex-1 p-3 rounded-lg border text-left ${
                      selectedLevel === 'database'
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Database className={`h-4 w-4 ${selectedLevel === 'database' ? 'text-cyan-600' : 'text-gray-400'}`} />
                      <span className="font-medium">Database Level</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Grant access to the entire database
                    </p>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedLevel('schema')
                      setSelectedPrivileges(new Set())
                    }}
                    className={`flex-1 p-3 rounded-lg border text-left ${
                      selectedLevel === 'schema'
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className={`h-4 w-4 ${selectedLevel === 'schema' ? 'text-cyan-600' : 'text-gray-400'}`} />
                      <span className="font-medium">Schema Level</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Grant access to a specific schema
                    </p>
                  </button>
                </div>
              </div>

              {/* Schema Selection (if schema level) */}
              {selectedLevel === 'schema' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Select Schema</label>
                  {schemas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No schemas found in this database</p>
                  ) : (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {schemas.map((schema) => (
                        <button
                          key={schema.fullName}
                          onClick={() => {
                            setSelectedSchema(schema.fullName)
                            setSelectedPrivileges(new Set())
                          }}
                          className={`w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 ${
                            selectedSchema === schema.fullName ? 'bg-cyan-50' : ''
                          }`}
                        >
                          <Folder className={`h-4 w-4 ${selectedSchema === schema.fullName ? 'text-cyan-600' : 'text-gray-400'}`} />
                          <span className="text-sm">{schema.name}</span>
                          {selectedSchema === schema.fullName && (
                            <Check className="h-4 w-4 text-cyan-600 ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Privilege Selection */}
              {(selectedLevel === 'database' || selectedSchema) && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Select Privileges
                  </label>
                  <div className="border rounded-lg p-2 space-y-1">
                    {availablePrivileges.map((privilege) => (
                      <button
                        key={privilege}
                        onClick={() => togglePrivilege(privilege)}
                        className={`w-full flex items-center gap-2 p-2 rounded text-left text-sm ${
                          selectedPrivileges.has(privilege)
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedPrivileges.has(privilege)
                            ? 'bg-cyan-600 border-cyan-600'
                            : 'border-gray-300'
                        }`}>
                          {selectedPrivileges.has(privilege) && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                        <span>{privilege}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t">
          <p className="text-xs text-muted-foreground">
            {selectedPrivileges.size > 0
              ? `${selectedPrivileges.size} privilege(s) selected`
              : 'Select privileges to grant'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedPrivileges.size === 0 || (selectedLevel === 'schema' && !selectedSchema)}
            >
              <Check className="h-4 w-4 mr-2" />
              Add to Changeset
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
