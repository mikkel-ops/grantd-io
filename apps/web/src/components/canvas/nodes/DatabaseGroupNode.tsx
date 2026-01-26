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
}

function DatabaseGroupNode({ data, id }: NodeProps) {
  const nodeData = data as unknown as DatabaseGroupNodeData
  const isExpanded = nodeData.isExpanded && nodeData.schemas && nodeData.schemas.length > 0

  // Create a map for quick lookup of schema grants
  const schemaGrantsMap = new Map<string, string[]>()
  if (nodeData.highlightedSchemas) {
    for (const sg of nodeData.highlightedSchemas) {
      schemaGrantsMap.set(sg.name, sg.privileges)
    }
  }
  const hasHighlights = (nodeData.highlightedDbPrivileges && nodeData.highlightedDbPrivileges.length > 0) ||
                        (nodeData.highlightedSchemas && nodeData.highlightedSchemas.length > 0)

  return (
    <div
      className={`shadow-md rounded-lg bg-gradient-to-b from-cyan-50 to-white w-[250px] cursor-pointer transition-opacity duration-200 ${
        isExpanded ? 'pb-2' : ''
      } ${hasHighlights ? 'border-2 border-green-400 ring-2 ring-green-200' : 'border-2 border-cyan-400'} ${nodeData.isFaded ? 'opacity-20' : ''}`}
    >
      {/* Main database header - always visible */}
      <div className="px-4 py-3">
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-db`}
          className={`w-3 h-3 ${hasHighlights ? '!bg-green-500' : '!bg-cyan-500'}`}
        />
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

      {/* Expanded schemas section */}
      {isExpanded && nodeData.schemas && (
        <div className="mx-2 mb-1 border-t border-cyan-200">
          <div className="text-[10px] text-cyan-500 uppercase tracking-wide px-2 py-1 font-medium">
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
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`schema-${schema.name}`}
                    className={`w-2.5 h-2.5 !left-[-5px] ${hasSchemaGrants ? '!bg-green-500' : '!bg-cyan-400'}`}
                  />
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full p-1 ${hasSchemaGrants ? 'bg-green-100' : 'bg-cyan-50'}`}>
                      <Folder className={`h-3 w-3 ${hasSchemaGrants ? 'text-green-600' : 'text-cyan-500'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-xs font-medium ${hasSchemaGrants ? 'text-green-700' : 'text-cyan-700'}`}>
                        {schema.name}
                      </div>
                      {/* Show schema privileges when highlighted */}
                      {hasSchemaGrants && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {schemaPrivileges.slice(0, 3).map((priv) => (
                            <span key={priv} className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded border border-green-300">
                              {priv}
                            </span>
                          ))}
                          {schemaPrivileges.length > 3 && (
                            <span className="text-[9px] text-green-600">+{schemaPrivileges.length - 3}</span>
                          )}
                        </div>
                      )}
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
