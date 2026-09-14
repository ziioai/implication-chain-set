export type ImplicationItem = string;
export type ImplicationChain = readonly ImplicationItem[];

export interface TreeNode {
  name: ImplicationItem;
  children?: readonly TreeNode[];
}

export interface ImplicationGraphEdge {
  from: ImplicationItem;
  to: ImplicationItem;
}

export interface ImplicationGraph {
  nodes?: readonly ImplicationItem[];
  edges: readonly ImplicationGraphEdge[];
}

export interface ImplicationCycle {
  items: ImplicationItem[];
}

export interface ImplicationChainSetDiagnostics {
  cycles: ImplicationCycle[];
}

export interface PathQueryOptions {
  explicit?: boolean;
  maxDepth?: number;
  maxPaths?: number;
}
