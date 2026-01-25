import { memo } from 'react'
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react'
import { Key } from 'lucide-react'

export interface GrantEdgeData {
  schemaCount: number
  hasDbGrants: boolean
  dbPrivileges: string[]
}

function GrantEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as GrantEdgeData | undefined
  const schemaCount = edgeData?.schemaCount ?? 0
  const hasDbGrants = edgeData?.hasDbGrants ?? false

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Build label text
  const labelParts: string[] = []
  if (hasDbGrants) {
    labelParts.push('DB')
  }
  if (schemaCount > 0) {
    labelParts.push(`${schemaCount} schema${schemaCount > 1 ? 's' : ''}`)
  }
  const labelText = labelParts.join(' + ')

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="flex items-center gap-1 px-2 py-1 bg-cyan-100 border border-cyan-300 rounded-full text-[10px] font-medium text-cyan-700 shadow-sm"
          >
            <Key className="h-3 w-3" />
            <span>{labelText}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(GrantEdge)
