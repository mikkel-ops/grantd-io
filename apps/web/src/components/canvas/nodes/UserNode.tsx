import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { User } from 'lucide-react'

export interface UserNodeData {
  label: string
  email?: string | null
  isNew?: boolean
}

function UserNode({ data }: NodeProps) {
  const nodeData = data as unknown as UserNodeData

  return (
    <div className={`px-4 py-3 shadow-md rounded-lg bg-white border-2 border-blue-400 min-w-[150px] ${
      nodeData.isNew ? 'outline outline-2 outline-dashed outline-green-500 outline-offset-4 animate-pulse' : ''
    }`}>
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-blue-100 p-1.5">
          <User className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <div className="text-sm font-medium">{nodeData.label}</div>
          {nodeData.email && (
            <div className="text-xs text-gray-500">{nodeData.email}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(UserNode)
