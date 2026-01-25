import { NodeTypes } from '@xyflow/react'
import UserNode from './UserNode'
import RoleNode from './RoleNode'
import DatabaseNode from './DatabaseNode'
import AddButtonNode from './AddButtonNode'

export { default as UserNode } from './UserNode'
export { default as RoleNode } from './RoleNode'
export { default as DatabaseNode } from './DatabaseNode'
export { default as AddButtonNode } from './AddButtonNode'

export type { UserNodeData } from './UserNode'
export type { RoleNodeData, RoleType } from './RoleNode'
export type { DatabaseNodeData } from './DatabaseNode'
export type { AddButtonNodeData } from './AddButtonNode'

// Node types registry for React Flow
export const nodeTypes: NodeTypes = {
  user: UserNode,
  role: RoleNode,
  database: DatabaseNode,
  addButton: AddButtonNode,
}
