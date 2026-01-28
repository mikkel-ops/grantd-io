import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Database, Folder, Key } from 'lucide-react'

export interface SchemaData {
  name: string
  fullName: string
}

export interface SchemaGrantInfo {
  name: string
  privileges: string[]
}

// Available privileges for databases and schemas
const DB_PRIVILEGES = ['USAGE', 'CREATE SCHEMA', 'MONITOR', 'MODIFY']
const SCHEMA_PRIVILEGES = ['USAGE', 'CREATE TABLE', 'CREATE VIEW', 'MODIFY', 'MONITOR']

export interface PendingPrivilegeChange {
  privilege: string
  objectType: 'DATABASE' | 'SCHEMA'
  schemaName?: string
  changeType: 'grant' | 'revoke'
  roleName?: string  // For building changeId when removing
}

export interface DatabaseGroupNodeData {
  label: string
  schemaCount?: number
  privileges?: string[]
  isExpanded?: boolean
  schemas?: SchemaData[]
  // Grant highlighting when a role is focused
  highlightedDbPrivileges?: string[]
  highlightedSchemas?: SchemaGrantInfo[]
  isFaded?: boolean
  // Focused role for privilege toggling
  focusedRole?: string
  // Pending privilege changes for this database
  pendingPrivilegeChanges?: PendingPrivilegeChange[]
  // Callback for privilege toggle (when role is focused)
  onPrivilegeToggle?: (
    databaseName: string,
    privilege: string,
    objectType: 'DATABASE' | 'SCHEMA',
    schemaName?: string,
    isCurrentlyGranted?: boolean
  ) => void
  // Callback for removing a pending change (when clicking on a pending privilege)
  onRemovePendingChange?: (
    changeId: string,
    changeType: 'grant_privilege' | 'revoke_privilege'
  ) => void
}

function DatabaseGroupNode({ data, id }: NodeProps) {
  const nodeData = data as unknown as DatabaseGroupNodeData
  const isExpanded = nodeData.isExpanded && nodeData.schemas && nodeData.schemas.length > 0
  const databaseName = nodeData.label

  // Create a map for quick lookup of schema grants
  const schemaGrantsMap = new Map<string, string[]>()
  if (nodeData.highlightedSchemas) {
    for (const sg of nodeData.highlightedSchemas) {
      schemaGrantsMap.set(sg.name, sg.privileges)
    }
  }
  const hasHighlights = (nodeData.highlightedDbPrivileges && nodeData.highlightedDbPrivileges.length > 0) ||
                        (nodeData.highlightedSchemas && nodeData.highlightedSchemas.length > 0)

  // Helper to check if a privilege has a pending change
  const getPendingChange = (privilege: string, objectType: 'DATABASE' | 'SCHEMA', schemaName?: string) => {
    if (!nodeData.pendingPrivilegeChanges) return null
    return nodeData.pendingPrivilegeChanges.find(
      p => p.privilege === privilege &&
           p.objectType === objectType &&
           (objectType === 'DATABASE' || p.schemaName === schemaName)
    )
  }

  // Handle privilege click
  const handlePrivilegeClick = (privilege: string, objectType: 'DATABASE' | 'SCHEMA', isCurrentlyGranted: boolean, schemaName?: string) => {
    // Check if there's a pending change for this privilege
    const pendingChange = getPendingChange(privilege, objectType, schemaName)

    if (pendingChange && pendingChange.roleName && nodeData.onRemovePendingChange) {
      // If there's a pending change, clicking removes it
      const objectName = objectType === 'SCHEMA' && schemaName
        ? `${databaseName}.${schemaName}`
        : databaseName
      const changeId = `toggle-${pendingChange.roleName}-${objectName}-${privilege}`
      const changeType = pendingChange.changeType === 'grant' ? 'grant_privilege' : 'revoke_privilege'
      nodeData.onRemovePendingChange(changeId, changeType)
    } else if (nodeData.onPrivilegeToggle && nodeData.focusedRole) {
      // If no pending change and a role is focused, toggle the privilege
      nodeData.onPrivilegeToggle(databaseName, privilege, objectType, schemaName, isCurrentlyGranted)
    }
  }

  return (
    <div
      className={`relative shadow-md rounded-lg bg-gradient-to-b from-cyan-50 to-white w-[250px] cursor-pointer transition-opacity duration-200 ${
        isExpanded ? 'pb-2' : ''
      } ${hasHighlights ? 'border-2 border-green-400 ring-2 ring-green-200' : 'border-2 border-cyan-400'} ${nodeData.isFaded ? 'opacity-20' : ''}`}
    >
      {/* Main target handle - large invisible hit area for easier connections */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${id}-db`}
        className="!w-10 !h-full !bg-transparent !border-0 !rounded-none !transform-none !top-0 !-left-5"
      />
      {/* Visual dot for main database target */}
      <div className={`absolute left-0 top-6 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none ${hasHighlights ? 'bg-green-500' : 'bg-cyan-500'}`} />

      {/* Main database header - always visible */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`rounded-full p-1.5 flex-shrink-0 ${hasHighlights ? 'bg-green-100' : 'bg-cyan-100'}`}>
            <Database className={`h-4 w-4 ${hasHighlights ? 'text-green-600' : 'text-cyan-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate" title={nodeData.label}>{nodeData.label}</div>
            {!isExpanded && nodeData.schemaCount !== undefined && nodeData.schemaCount > 0 && (
              <span className="text-xs text-cyan-600">
                {nodeData.schemaCount} schema{nodeData.schemaCount !== 1 ? 's' : ''}
              </span>
            )}
            {/* Show highlighted DB privileges when focused */}
            {nodeData.highlightedDbPrivileges && nodeData.highlightedDbPrivileges.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {nodeData.highlightedDbPrivileges.map((priv) => (
                  <span key={priv} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-300 font-medium">
                    {priv}
                  </span>
                ))}
              </div>
            )}
            {/* Show regular privileges if no highlights */}
            {!nodeData.highlightedDbPrivileges?.length && nodeData.privileges && nodeData.privileges.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {nodeData.privileges.slice(0, 3).map((priv) => (
                  <span key={priv} className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">
                    {priv}
                  </span>
                ))}
                {nodeData.privileges.length > 3 && (
                  <span className="text-[10px] text-cyan-600">+{nodeData.privileges.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded section with DB privileges and schemas */}
      {isExpanded && nodeData.schemas && (
        <div
          className="mx-2 mb-1 border-t border-cyan-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Database-level privileges section */}
          <div className="text-[10px] text-cyan-500 uppercase tracking-wide px-2 py-1 font-medium">
            Database Privileges
          </div>
          <div className="flex flex-wrap gap-1 px-2 pb-2">
            {DB_PRIVILEGES.map((priv) => {
              const isGranted = nodeData.highlightedDbPrivileges?.includes(priv)
              const pendingChange = getPendingChange(priv, 'DATABASE')
              const isPendingGrant = pendingChange?.changeType === 'grant'
              const isPendingRevoke = pendingChange?.changeType === 'revoke'
              // Can click if: (1) role is focused and we have toggle callback, OR (2) there's a pending change we can remove
              const canToggle = !!nodeData.focusedRole && !!nodeData.onPrivilegeToggle
              const canRemovePending = !!pendingChange && !!nodeData.onRemovePendingChange
              const canClick = canToggle || canRemovePending

              return (
                <div key={priv} className="relative">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`db-priv-${priv}`}
                    className={`w-2 h-2 !left-[-4px] ${isGranted || isPendingGrant ? '!bg-green-500' : '!bg-cyan-400'}`}
                  />
                  <span
                    onClick={() => canClick && handlePrivilegeClick(priv, 'DATABASE', !!isGranted)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      canClick ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isPendingGrant
                        ? 'bg-green-200 text-green-800 border-green-500 font-medium ring-1 ring-green-400'
                        : isPendingRevoke
                        ? 'bg-red-100 text-red-700 border-red-400 font-medium line-through ring-1 ring-red-300'
                        : isGranted
                        ? 'bg-green-100 text-green-700 border-green-300 font-medium'
                        : canToggle
                        ? 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:border-green-400 hover:bg-green-50 hover:text-green-600'
                        : 'bg-cyan-50 text-cyan-600 border-cyan-200'
                    }`}
                  >
                    {isPendingGrant && '+ '}{isPendingRevoke && '- '}{priv}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Schemas section */}
          <div className="text-[10px] text-cyan-500 uppercase tracking-wide px-2 py-1 font-medium border-t border-cyan-100">
            Schemas
          </div>
          <div className="space-y-1">
            {nodeData.schemas.map((schema) => {
              const schemaPrivileges = schemaGrantsMap.get(schema.name)
              const hasSchemaGrants = schemaPrivileges && schemaPrivileges.length > 0

              return (
                <div
                  key={schema.name}
                  className={`relative mx-1 px-3 py-2 rounded bg-white transition-colors ${
                    hasSchemaGrants
                      ? 'border-2 border-green-400 bg-green-50'
                      : 'border border-cyan-200 hover:border-cyan-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full p-1 ${hasSchemaGrants ? 'bg-green-100' : 'bg-cyan-50'}`}>
                      <Folder className={`h-3 w-3 ${hasSchemaGrants ? 'text-green-600' : 'text-cyan-500'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-xs font-medium ${hasSchemaGrants ? 'text-green-700' : 'text-cyan-700'}`}>
                        {schema.name}
                      </div>
                      {/* Show available schema privileges as connection targets */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {SCHEMA_PRIVILEGES.slice(0, 4).map((priv) => {
                          const isGranted = schemaPrivileges?.includes(priv)
                          const pendingChange = getPendingChange(priv, 'SCHEMA', schema.name)
                          const isPendingGrant = pendingChange?.changeType === 'grant'
                          const isPendingRevoke = pendingChange?.changeType === 'revoke'
                          // Can click if: (1) role is focused and we have toggle callback, OR (2) there's a pending change we can remove
                          const canToggle = !!nodeData.focusedRole && !!nodeData.onPrivilegeToggle
                          const canRemovePending = !!pendingChange && !!nodeData.onRemovePendingChange
                          const canClick = canToggle || canRemovePending

                          return (
                            <div key={priv} className="relative">
                              <Handle
                                type="target"
                                position={Position.Left}
                                id={`schema-${schema.name}-priv-${priv}`}
                                className={`w-1.5 h-1.5 !left-[-3px] ${isGranted || isPendingGrant ? '!bg-green-500' : '!bg-cyan-300'}`}
                              />
                              <span
                                onClick={() => canClick && handlePrivilegeClick(priv, 'SCHEMA', !!isGranted, schema.name)}
                                className={`text-[8px] px-1 py-0.5 rounded border transition-colors ${
                                  canClick ? 'cursor-pointer' : 'cursor-default'
                                } ${
                                  isPendingGrant
                                    ? 'bg-green-200 text-green-800 border-green-500 font-medium ring-1 ring-green-400'
                                    : isPendingRevoke
                                    ? 'bg-red-100 text-red-700 border-red-400 font-medium line-through ring-1 ring-red-300'
                                    : isGranted
                                    ? 'bg-green-100 text-green-700 border-green-300'
                                    : canToggle
                                    ? 'bg-gray-50 text-gray-500 border-gray-200 hover:border-green-300 hover:bg-green-50 hover:text-green-600'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}
                              >
                                {isPendingGrant && '+ '}{isPendingRevoke && '- '}{priv}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {hasSchemaGrants && (
                      <Key className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(DatabaseGroupNode)
