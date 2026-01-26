import { useState, useCallback, useMemo } from 'react'
import { Node, Edge } from '@xyflow/react'

interface UseLineageFocusResult {
  focusedNodeId: string | null
  lineageNodeIds: Set<string>
  lineageEdgeIds: Set<string>
  setFocusedNode: (nodeId: string | null) => void
  isNodeInLineage: (nodeId: string) => boolean
  isEdgeInLineage: (edgeId: string) => boolean
}

/**
 * Computes the lineage (all connected nodes and edges) for a given node.
 * Traverses the graph bidirectionally to find all connected elements.
 */
function computeLineage(
  nodeId: string,
  _nodes: Node[],
  edges: Edge[]
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([nodeId])
  const edgeIds = new Set<string>()
  const visited = new Set<string>([nodeId])
  const queue = [nodeId]

  // Build adjacency maps for efficient traversal
  const outgoingEdges = new Map<string, Edge[]>()
  const incomingEdges = new Map<string, Edge[]>()

  for (const edge of edges) {
    // Skip add button nodes and their edges
    if (edge.source.includes('add-') || edge.target.includes('add-')) continue

    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, [])
    }
    outgoingEdges.get(edge.source)!.push(edge)

    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, [])
    }
    incomingEdges.get(edge.target)!.push(edge)
  }

  // BFS to find all connected nodes
  while (queue.length > 0) {
    const current = queue.shift()!

    // Traverse outgoing edges (source -> target)
    const outgoing = outgoingEdges.get(current) || []
    for (const edge of outgoing) {
      edgeIds.add(edge.id)
      if (!visited.has(edge.target)) {
        visited.add(edge.target)
        nodeIds.add(edge.target)
        queue.push(edge.target)
      }
    }

    // Traverse incoming edges (target <- source)
    const incoming = incomingEdges.get(current) || []
    for (const edge of incoming) {
      edgeIds.add(edge.id)
      if (!visited.has(edge.source)) {
        visited.add(edge.source)
        nodeIds.add(edge.source)
        queue.push(edge.source)
      }
    }
  }

  return { nodeIds, edgeIds }
}

export function useLineageFocus(
  nodes: Node[],
  edges: Edge[]
): UseLineageFocusResult {
  const [focusedNodeId, setFocusedNodeIdState] = useState<string | null>(null)

  // Compute lineage when a node is focused - always returns valid Sets
  const [lineageNodeIds, lineageEdgeIds] = useMemo((): [Set<string>, Set<string>] => {
    if (!focusedNodeId || nodes.length === 0) {
      return [new Set<string>(), new Set<string>()]
    }
    const result = computeLineage(focusedNodeId, nodes, edges)
    return [result.nodeIds, result.edgeIds]
  }, [focusedNodeId, nodes, edges])

  const setFocusedNode = useCallback((nodeId: string | null) => {
    // Toggle off if clicking the same node
    setFocusedNodeIdState(prev => prev === nodeId ? null : nodeId)
  }, [])

  const isNodeInLineage = useCallback(
    (nodeId: string) => {
      if (!focusedNodeId) return true // No focus means all nodes are visible
      return lineageNodeIds.has(nodeId)
    },
    [focusedNodeId, lineageNodeIds]
  )

  const isEdgeInLineage = useCallback(
    (edgeId: string) => {
      if (!focusedNodeId) return true // No focus means all edges are visible
      return lineageEdgeIds.has(edgeId)
    },
    [focusedNodeId, lineageEdgeIds]
  )

  return {
    focusedNodeId,
    lineageNodeIds,
    lineageEdgeIds,
    setFocusedNode,
    isNodeInLineage,
    isEdgeInLineage,
  }
}
