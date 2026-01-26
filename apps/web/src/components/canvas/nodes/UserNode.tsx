import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { User } from 'lucide-react'

export interface UserNodeData {
  label: string
  email?: string | null
  isNew?: boolean
  isFaded?: boolean
}

function UserNode({ data }: NodeProps) {
  const nodeData = data as unknown as UserNodeData

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg bg-white border-2 border-blue-400 w-[250px] transition-opacity duration-200 ${
      nodeData.isNew ? 'outline outline-2 outline-dashed outline-green-500 outline-offset-4 animate-pulse' : ''
    } ${nodeData.isFaded ? 'opacity-20' : ''}`}>
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-blue-100 p-1.5 flex-shrink-0">
          <User className="h-4 w-4 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" title={nodeData.label}>{nodeData.label}</div>
          {nodeData.email && (
            <div className="text-xs text-gray-500 truncate" title={nodeData.email}>{nodeData.email}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(UserNode)
