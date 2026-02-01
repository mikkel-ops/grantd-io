import { memo } from 'react'
import { EdgeProps, EdgeLabelRenderer } from '@xyflow/react'
import { Key } from 'lucide-react'

export interface GrantEdgeData {
  schemaCount: number
  hasDbGrants: boolean
  dbPrivileges: string[]
  isFaded?: boolean
  edgeIndex?: number    // Index for vertical label stacking
  totalEdges?: number   // Total edges for this role (for centering)
}

function GrantEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as GrantEdgeData | undefined
  const schemaCount = edgeData?.schemaCount ?? 0
  const hasDbGrants = edgeData?.hasDbGrants ?? false
  const edgeIndex = edgeData?.edgeIndex ?? 0
  const totalEdges = edgeData?.totalEdges ?? 1

  // Get opacity from style (set by lineage focus)
  const opacity = (style?.opacity as number) ?? 1
  const isHidden = opacity === 0

  // Label positioning constants
  const LABEL_X_OFFSET = 80   // Offset from role edge (handle is at edge of node)
  const LABEL_HEIGHT = 28      // Height per label including spacing
  const LABEL_WIDTH = 110      // Approximate label width

  // Center labels vertically around the source handle (sourceY is at node center)
  // Calculate offset to center all labels as a group
  const totalHeight = totalEdges * LABEL_HEIGHT
  const startY = sourceY - (totalHeight / 2) + (LABEL_HEIGHT / 2)
  const labelPosX = sourceX + LABEL_X_OFFSET
  const labelPosY = startY + (edgeIndex * LABEL_HEIGHT)

  // Calculate label edges for path routing
  const labelLeftX = labelPosX - LABEL_WIDTH / 2
  const labelRightX = labelPosX + LABEL_WIDTH / 2

  // Build label text
  const labelParts: string[] = []
  if (hasDbGrants) {
    labelParts.push('DB')
  }
  if (schemaCount > 0) {
    labelParts.push(`${schemaCount} schema${schemaCount > 1 ? 's' : ''}`)
  }
  const labelText = labelParts.join(' + ')

  // Create a path that goes through the label:
  // 1. Source → Label left edge (with curve)
  // 2. Label right edge → Target (with curve)
  const hasLabel = labelText && opacity > 0

  let edgePath: string
  if (hasLabel) {
    // Control point offsets for smooth curves
    const curve1 = 30  // Curve for first segment
    const curve2 = Math.min(80, (targetX - labelRightX) * 0.4)  // Curve for second segment

    // Path: source → label left, then label right → target
    edgePath = `
      M ${sourceX} ${sourceY}
      C ${sourceX + curve1} ${sourceY}, ${labelLeftX - curve1} ${labelPosY}, ${labelLeftX} ${labelPosY}
      M ${labelRightX} ${labelPosY}
      C ${labelRightX + curve2} ${labelPosY}, ${targetX - curve2} ${targetY}, ${targetX} ${targetY}
    `
  } else {
    // Simple bezier when no label
    const midX = (sourceX + targetX) / 2
    edgePath = `
      M ${sourceX} ${sourceY}
      C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}
    `
  }

  return (
    <>
      {/* Invisible interaction path for easier clicking - disabled when edge is hidden */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
        style={{
          pointerEvents: isHidden ? 'none' : 'auto',
          cursor: isHidden ? 'default' : 'pointer',
        }}
      />
      {/* Visible edge path */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          ...style,
          pointerEvents: isHidden ? 'none' : 'auto',
          cursor: isHidden ? 'default' : 'pointer',
        }}
        markerEnd={markerEnd}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPosX}px,${labelPosY}px)`,
              pointerEvents: 'all',
              minWidth: '100px',  // Consistent width for all labels
            }}
            className="flex items-center justify-center gap-1 px-2 py-1 bg-cyan-100 border border-cyan-300 rounded-full text-[10px] font-medium text-cyan-700 shadow-sm"
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
