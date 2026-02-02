import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { User, X } from 'lucide-react'

export interface UserNodeData {
  label: string
  email?: string | null
  isNew?: boolean
  isFaded?: boolean
  isPendingDelete?: boolean
  onDeleteToggle?: () => void
}

function UserNode({ data }: NodeProps) {
  const nodeData = data as unknown as UserNodeData
  const isPendingDelete = nodeData.isPendingDelete

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-lg w-[250px] transition-all duration-200 ${
      isPendingDelete
        ? 'bg-red-50 border-2 border-red-500'
        : 'bg-white border-2 border-blue-400'
    } ${nodeData.isNew ? 'outline outline-2 outline-dashed outline-green-500 outline-offset-4 animate-pulse' : ''
    } ${nodeData.isFaded ? 'opacity-20' : ''}`}>
      {/* Delete toggle button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          console.log('[UserNode] Delete clicked, onDeleteToggle:', typeof nodeData.onDeleteToggle, nodeData.label)
          nodeData.onDeleteToggle?.()
        }}
        className={`absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors z-10 ${
          isPendingDelete
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-gray-200 text-gray-500 hover:bg-red-100 hover:text-red-500'
        }`}
        title={isPendingDelete ? 'Cancel delete' : 'Delete user'}
      >
        <X className="h-3 w-3" />
      </button>

      <Handle type="source" position={Position.Right} className={`w-3 h-3 ${isPendingDelete ? '!bg-red-500' : '!bg-blue-500'}`} />
      <div className="flex items-center gap-2">
        <div className={`rounded-full p-1.5 flex-shrink-0 ${isPendingDelete ? 'bg-red-100' : 'bg-blue-100'}`}>
          <User className={`h-4 w-4 ${isPendingDelete ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${isPendingDelete ? 'text-red-700 line-through' : ''}`} title={nodeData.label}>{nodeData.label}</div>
          {nodeData.email && (
            <div className={`text-xs truncate ${isPendingDelete ? 'text-red-500' : 'text-gray-500'}`} title={nodeData.email}>{nodeData.email}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(UserNode)
