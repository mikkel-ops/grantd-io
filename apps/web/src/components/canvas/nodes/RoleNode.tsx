import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Shield, X } from 'lucide-react'

export type RoleType = 'functional' | 'business' | 'hybrid' | null

export interface RoleNodeData {
  label: string
  type?: RoleType
  isSystem?: boolean
  isNew?: boolean
  isFaded?: boolean
  isPendingDelete?: boolean
  onDeleteToggle?: () => void
}

const ROLE_STYLES = {
  functional: {
    border: 'border-purple-400',
    bg: 'bg-purple-100',
    icon: 'text-purple-600',
  },
  business: {
    border: 'border-green-400',
    bg: 'bg-green-100',
    icon: 'text-green-600',
  },
  hybrid: {
    border: 'border-amber-400',
    bg: 'bg-amber-100',
    icon: 'text-amber-600',
  },
  default: {
    border: 'border-gray-400',
    bg: 'bg-gray-100',
    icon: 'text-gray-600',
  },
} as const

function RoleNode({ data }: NodeProps) {
  const nodeData = data as unknown as RoleNodeData
  const isPendingDelete = nodeData.isPendingDelete
  const styles = nodeData.type && nodeData.type in ROLE_STYLES
    ? ROLE_STYLES[nodeData.type as keyof typeof ROLE_STYLES]
    : ROLE_STYLES.default

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-lg w-[250px] cursor-pointer transition-all duration-200 ${
      isPendingDelete
        ? 'bg-red-50 border-2 border-red-500'
        : `bg-white border-2 ${styles.border}`
    } ${nodeData.isNew ? 'outline outline-2 outline-dashed outline-green-500 outline-offset-4' : ''
    } ${nodeData.isFaded ? 'opacity-20' : ''}`}>
      {/* Delete toggle button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          console.log('[RoleNode] Delete clicked, onDeleteToggle:', typeof nodeData.onDeleteToggle, nodeData.label)
          nodeData.onDeleteToggle?.()
        }}
        className={`absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors z-10 ${
          isPendingDelete
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-gray-200 text-gray-500 hover:bg-red-100 hover:text-red-500'
        }`}
        title={isPendingDelete ? 'Cancel delete' : 'Delete role'}
      >
        <X className="h-3 w-3" />
      </button>

      {/* Target handle - positioned at node edge for accurate edge connection */}
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !rounded-full !border-0 ${isPendingDelete ? '!bg-red-500' : '!bg-gray-500'}`}
      />
      <Handle type="source" position={Position.Right} className={`w-3 h-3 ${isPendingDelete ? '!bg-red-500' : '!bg-gray-500'}`} />
      <div className="flex items-center gap-2">
        <div className={`rounded-full p-1.5 flex-shrink-0 ${isPendingDelete ? 'bg-red-100' : styles.bg}`}>
          <Shield className={`h-4 w-4 ${isPendingDelete ? 'text-red-600' : styles.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${isPendingDelete ? 'text-red-700 line-through' : ''}`} title={nodeData.label}>{nodeData.label}</div>
          {nodeData.type && (
            <div className={`text-xs capitalize ${isPendingDelete ? 'text-red-500' : 'text-gray-500'}`}>{nodeData.type}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(RoleNode)
