import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Folder } from 'lucide-react'

export interface SchemaNodeData {
  label: string
  databaseName: string
  fullName: string // DB.SCHEMA format
}

function SchemaNode({ data }: NodeProps) {
  const nodeData = data as unknown as SchemaNodeData

  return (
    <div className="px-3 py-2 shadow-sm rounded-lg bg-white border-2 border-cyan-300 min-w-[160px]">
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-cyan-400" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-cyan-50 p-1">
          <Folder className="h-3 w-3 text-cyan-500" />
        </div>
        <div className="text-xs font-medium text-cyan-700">{nodeData.label}</div>
      </div>
    </div>
  )
}

export default memo(SchemaNode)
