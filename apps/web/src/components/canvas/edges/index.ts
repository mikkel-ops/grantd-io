import { EdgeTypes } from '@xyflow/react'
import GrantEdge from './GrantEdge'

export { default as GrantEdge } from './GrantEdge'
export type { GrantEdgeData } from './GrantEdge'

// Edge types registry for React Flow
export const edgeTypes: EdgeTypes = {
  grantEdge: GrantEdge,
}
