import { memo } from 'react'
import { NodeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'

export interface AddButtonNodeData {
  label: string
  type: 'user' | 'role'
  onClick: () => void
}

function AddButtonNode({ data }: NodeProps) {
  const nodeData = data as unknown as AddButtonNodeData
  const isUser = nodeData.type === 'user'

  return (
    <button
      onClick={nodeData.onClick}
      className={`px-4 py-3 shadow-md rounded-lg bg-white border-2 border-dashed min-w-[150px] cursor-pointer transition-all hover:shadow-lg ${
        isUser ? 'border-blue-300 hover:border-blue-400' : 'border-green-300 hover:border-green-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`rounded-full p-1.5 ${isUser ? 'bg-blue-50' : 'bg-green-50'}`}>
          <Plus className={`h-4 w-4 ${isUser ? 'text-blue-400' : 'text-green-400'}`} />
        </div>
        <div className={`text-sm font-medium ${isUser ? 'text-blue-500' : 'text-green-500'}`}>
          {nodeData.label}
        </div>
      </div>
    </button>
  )
}

export default memo(AddButtonNode)
