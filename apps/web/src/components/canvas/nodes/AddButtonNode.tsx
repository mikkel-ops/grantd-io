import { memo } from 'react'
import { NodeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'

export interface AddButtonNodeData {
  label: string
  type: 'user' | 'role' | 'functional-role'
  onClick: () => void
  isFaded?: boolean
}

const BUTTON_STYLES = {
  user: {
    border: 'border-blue-300 hover:border-blue-400',
    bg: 'bg-blue-50',
    icon: 'text-blue-400',
    text: 'text-blue-500',
  },
  role: {
    border: 'border-green-300 hover:border-green-400',
    bg: 'bg-green-50',
    icon: 'text-green-400',
    text: 'text-green-500',
  },
  'functional-role': {
    border: 'border-purple-300 hover:border-purple-400',
    bg: 'bg-purple-50',
    icon: 'text-purple-400',
    text: 'text-purple-500',
  },
} as const

function AddButtonNode({ data }: NodeProps) {
  const nodeData = data as unknown as AddButtonNodeData
  const styles = BUTTON_STYLES[nodeData.type]

  return (
    <button
      onClick={nodeData.onClick}
      className={`px-4 py-3 shadow-md rounded-lg bg-white border-2 border-dashed w-[250px] cursor-pointer transition-all hover:shadow-lg ${styles.border} ${nodeData.isFaded ? 'opacity-20' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className={`rounded-full p-1.5 ${styles.bg}`}>
          <Plus className={`h-4 w-4 ${styles.icon}`} />
        </div>
        <div className={`text-sm font-medium ${styles.text}`}>
          {nodeData.label}
        </div>
      </div>
    </button>
  )
}

export default memo(AddButtonNode)
