import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Database, Layers } from 'lucide-react'

export interface DatabaseNodeData {
  label: string
  schemaCount?: number
  privileges?: string[]
}

function DatabaseNode({ data }: NodeProps) {
  const nodeData = data as unknown as DatabaseNodeData

  return (
    <div className="px-4 py-3 shadow-md rounded-lg bg-white border-2 border-cyan-400 min-w-[180px]">
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-cyan-500" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-cyan-100 p-1.5">
          <Database className="h-4 w-4 text-cyan-600" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">{nodeData.label}</div>
          <div className="flex items-center gap-2">
            {nodeData.schemaCount !== undefined && nodeData.schemaCount > 0 && (
              <span className="text-xs text-cyan-600 flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {nodeData.schemaCount} schema{nodeData.schemaCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {nodeData.privileges && nodeData.privileges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {nodeData.privileges.slice(0, 3).map((priv) => (
                <span key={priv} className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded">
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
  )
}

export default memo(DatabaseNode)
