import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Shield } from 'lucide-react'

export type RoleType = 'functional' | 'business' | 'hybrid' | null

export interface RoleNodeData {
  label: string
  type?: RoleType
  isSystem?: boolean
  isNew?: boolean
  isFaded?: boolean
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
  const styles = nodeData.type && nodeData.type in ROLE_STYLES
    ? ROLE_STYLES[nodeData.type as keyof typeof ROLE_STYLES]
    : ROLE_STYLES.default

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-lg bg-white border-2 ${styles.border} w-[250px] cursor-pointer transition-opacity duration-200 ${
      nodeData.isNew ? 'outline outline-2 outline-dashed outline-green-500 outline-offset-4 animate-pulse' : ''
    } ${nodeData.isFaded ? 'opacity-20' : ''}`}>
      {/* Target handle - large invisible hit area, visual dot is separate */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-10 !h-full !bg-transparent !border-0 !rounded-none !transform-none !top-0 !-left-5"
      />
      {/* Visual dot for target (pointer-events-none so clicks go to Handle) */}
      <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gray-500 pointer-events-none" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-gray-500" />
      <div className="flex items-center gap-2">
        <div className={`rounded-full ${styles.bg} p-1.5 flex-shrink-0`}>
          <Shield className={`h-4 w-4 ${styles.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" title={nodeData.label}>{nodeData.label}</div>
          {nodeData.type && (
            <div className="text-xs text-gray-500 capitalize">{nodeData.type}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(RoleNode)
