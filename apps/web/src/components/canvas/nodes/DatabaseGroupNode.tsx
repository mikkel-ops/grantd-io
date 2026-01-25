import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Database, Folder } from 'lucide-react'

export interface SchemaData {
  name: string
  fullName: string
}

export interface DatabaseGroupNodeData {
  label: string
  schemaCount?: number
  privileges?: string[]
  isExpanded?: boolean
  schemas?: SchemaData[]
}

function DatabaseGroupNode({ data, id }: NodeProps) {
  const nodeData = data as unknown as DatabaseGroupNodeData
  const isExpanded = nodeData.isExpanded && nodeData.schemas && nodeData.schemas.length > 0

  return (
    <div
      className={`shadow-md rounded-lg bg-gradient-to-b from-cyan-50 to-white border-2 border-cyan-400 min-w-[200px] cursor-pointer ${
        isExpanded ? 'pb-2' : ''
      }`}
    >
      {/* Main database header - always visible */}
      <div className="px-4 py-3">
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-db`}
          className="w-3 h-3 !bg-cyan-500"
        />
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-cyan-100 p-1.5">
            <Database className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">{nodeData.label}</div>
            {!isExpanded && nodeData.schemaCount !== undefined && nodeData.schemaCount > 0 && (
              <span className="text-xs text-cyan-600">
                {nodeData.schemaCount} schema{nodeData.schemaCount !== 1 ? 's' : ''}
              </span>
            )}
            {nodeData.privileges && nodeData.privileges.length > 0 && (
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
            {nodeData.schemas.map((schema) => (
              <div
                key={schema.name}
                className="relative mx-1 px-3 py-2 rounded bg-white border border-cyan-200 hover:border-cyan-400 transition-colors"
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`schema-${schema.name}`}
                  className="w-2.5 h-2.5 !bg-cyan-400 !left-[-5px]"
                />
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-cyan-50 p-1">
                    <Folder className="h-3 w-3 text-cyan-500" />
                  </div>
                  <div className="text-xs font-medium text-cyan-700">{schema.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(DatabaseGroupNode)
