import type {
  ImplicationChain,
  ImplicationChainSetDiagnostics,
  ImplicationGraph,
  ImplicationItem,
  PathQueryOptions,
  TreeNode,
} from "./types.js";

type Direction = "up" | "down" | "all";

function readonlySet<T>(set: Set<T> | undefined): Set<T> {
  return new Set(set ?? []);
}

function addToMapSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): boolean {
  let set = map.get(key);
  if (set == null) {
    set = new Set();
    map.set(key, set);
  }
  const existed = set.has(value);
  set.add(value);
  return !existed;
}

function unionInto<T>(target: Set<T>, source: Iterable<T>): void {
  for (const item of source) target.add(item);
}

function pathKeyOf(path: readonly string[]): string {
  return path.join("\u0000");
}

function normalizeChain(chain: readonly string[]): string[] {
  const result: string[] = [];
  for (const item of chain) {
    if (item == null) continue;
    const text = String(item);
    if (text.length === 0) continue;
    result.push(text);
  }
  return result;
}

export class ImplicationChainSet {
  readonly items = new Set<ImplicationItem>();

  private impliedBy = new Map<ImplicationItem, Set<ImplicationItem>>();
  private impliesTo = new Map<ImplicationItem, Set<ImplicationItem>>();
  private explicitNearestAncestors = new Map<ImplicationItem, Set<ImplicationItem>>();
  private explicitNearestDescendants = new Map<ImplicationItem, Set<ImplicationItem>>();
  private evidenceChains: ImplicationItem[][] = [];
  private nearestAncestorsCache: Map<ImplicationItem, Set<ImplicationItem>> | undefined;
  private nearestDescendantsCache: Map<ImplicationItem, Set<ImplicationItem>> | undefined;
  private farthestAncestorsCache: Map<ImplicationItem, Set<ImplicationItem>> | undefined;
  private farthestDescendantsCache: Map<ImplicationItem, Set<ImplicationItem>> | undefined;
  private diagnosticsCache: ImplicationChainSetDiagnostics | undefined;

  constructor(chains: readonly ImplicationChain[] = []) {
    this.addChains(chains);
  }

  addChain(chain: ImplicationChain): this {
    const normalized = normalizeChain(chain);
    if (normalized.length === 0) return this;

    for (const item of normalized) this.items.add(item);
    if (normalized.length === 1) return this;

    this.evidenceChains.push([...normalized]);
    for (let ancestorIndex = 0; ancestorIndex < normalized.length - 1; ancestorIndex++) {
      for (let descendantIndex = ancestorIndex + 1; descendantIndex < normalized.length; descendantIndex++) {
        this.addImplication(normalized[descendantIndex], normalized[ancestorIndex]);
      }
    }
    return this;
  }

  addChains(chains: readonly ImplicationChain[]): this {
    for (const chain of chains) this.addChain(chain);
    return this;
  }

  addTree(tree: TreeNode): this {
    this.addTrees([tree]);
    return this;
  }

  addTrees(trees: readonly TreeNode[]): this {
    for (const tree of trees) this.addTreeWalk(tree, []);
    return this;
  }

  addGraph(graph: ImplicationGraph): this {
    this.addGraphs([graph]);
    return this;
  }

  addGraphs(graphs: readonly ImplicationGraph[]): this {
    for (const graph of graphs) {
      for (const node of graph.nodes ?? []) this.items.add(node);
      for (const edge of graph.edges) {
        this.addExplicitImplication(edge.to, edge.from);
        this.evidenceChains.push([edge.from, edge.to]);
      }
    }
    return this;
  }

  addDescendantsTo(ancestor: ImplicationItem, descendants: readonly ImplicationItem[]): this {
    this.items.add(ancestor);
    for (const descendant of descendants) {
      this.addExplicitImplication(descendant, ancestor);
      this.evidenceChains.push([ancestor, descendant]);
    }
    return this;
  }

  addAncestorsTo(descendant: ImplicationItem, ancestors: readonly ImplicationItem[]): this {
    this.items.add(descendant);
    for (const ancestor of ancestors) {
      this.addExplicitImplication(descendant, ancestor);
      this.evidenceChains.push([ancestor, descendant]);
    }
    return this;
  }

  implies(from: ImplicationItem, to: ImplicationItem): boolean {
    return from === to || this.impliedBy.get(from)?.has(to) === true;
  }

  getImpliedItems(from: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.impliedBy.get(from));
  }

  getItemsImplying(to: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.impliesTo.get(to));
  }

  getNearestDescendants(ancestor: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.getNearestDescendantsMap().get(ancestor));
  }

  getNearestAncestors(descendant: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.getNearestAncestorsMap().get(descendant));
  }

  getFarthestDescendants(ancestor: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.getFarthestDescendantsMap().get(ancestor));
  }

  getFarthestAncestors(descendant: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.getFarthestAncestorsMap().get(descendant));
  }

  getExplicitNearestDescendants(ancestor: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.explicitNearestDescendants.get(ancestor));
  }

  getExplicitNearestAncestors(descendant: ImplicationItem): Set<ImplicationItem> {
    return readonlySet(this.explicitNearestAncestors.get(descendant));
  }

  getUpPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "up");
  }

  getDownPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "down");
  }

  getAllPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "all");
  }

  getExplicitUpPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "up", { explicit: true });
  }

  getExplicitDownPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "down", { explicit: true });
  }

  getExplicitAllPaths(from: ImplicationItem, to: ImplicationItem): string[][] {
    return this.getPaths(from, to, "all", { explicit: true });
  }

  getDiagnostics(): ImplicationChainSetDiagnostics {
    this.diagnosticsCache ??= {
      cycles: this.findCycles(),
    };
    return {
      cycles: this.diagnosticsCache.cycles.map((cycle) => ({ items: [...cycle.items] })),
    };
  }

  private addTreeWalk(node: TreeNode, chainPrefix: string[]): void {
    const chain = [...chainPrefix, node.name];
    this.items.add(node.name);
    if (chain.length > 1) {
      this.addChain(chain);
      this.addExplicitImplication(node.name, chainPrefix[chainPrefix.length - 1]);
    }

    for (const child of node.children ?? []) {
      this.addTreeWalk(child, chain);
    }
  }

  private addExplicitImplication(descendant: ImplicationItem, ancestor: ImplicationItem): void {
    this.items.add(descendant);
    this.items.add(ancestor);
    addToMapSet(this.explicitNearestAncestors, descendant, ancestor);
    addToMapSet(this.explicitNearestDescendants, ancestor, descendant);
    this.addImplication(descendant, ancestor);
  }

  private addImplication(descendant: ImplicationItem, ancestor: ImplicationItem): void {
    if (descendant === ancestor) return;

    const lower = new Set<ImplicationItem>([descendant]);
    unionInto(lower, this.impliesTo.get(descendant) ?? []);

    const upper = new Set<ImplicationItem>([ancestor]);
    unionInto(upper, this.impliedBy.get(ancestor) ?? []);

    for (const lowerItem of lower) {
      for (const upperItem of upper) {
        if (lowerItem === upperItem) continue;
        addToMapSet(this.impliedBy, lowerItem, upperItem);
        addToMapSet(this.impliesTo, upperItem, lowerItem);
      }
    }

    this.clearDerivedCaches();
  }

  private clearDerivedCaches(): void {
    this.nearestAncestorsCache = undefined;
    this.nearestDescendantsCache = undefined;
    this.farthestAncestorsCache = undefined;
    this.farthestDescendantsCache = undefined;
    this.diagnosticsCache = undefined;
  }

  private getNearestAncestorsMap(): Map<ImplicationItem, Set<ImplicationItem>> {
    this.nearestAncestorsCache ??= this.buildNearestMap(this.impliedBy, "ancestor");
    return this.nearestAncestorsCache;
  }

  private getNearestDescendantsMap(): Map<ImplicationItem, Set<ImplicationItem>> {
    this.nearestDescendantsCache ??= this.buildNearestMap(this.impliesTo, "descendant");
    return this.nearestDescendantsCache;
  }

  private getFarthestAncestorsMap(): Map<ImplicationItem, Set<ImplicationItem>> {
    this.farthestAncestorsCache ??= this.buildFarthestMap(this.impliedBy, "ancestor");
    return this.farthestAncestorsCache;
  }

  private getFarthestDescendantsMap(): Map<ImplicationItem, Set<ImplicationItem>> {
    this.farthestDescendantsCache ??= this.buildFarthestMap(this.impliesTo, "descendant");
    return this.farthestDescendantsCache;
  }

  private buildNearestMap(
    relation: Map<ImplicationItem, Set<ImplicationItem>>,
    kind: "ancestor" | "descendant",
  ): Map<ImplicationItem, Set<ImplicationItem>> {
    const result = new Map<ImplicationItem, Set<ImplicationItem>>();

    for (const [item, candidates] of relation) {
      const nearest = new Set<ImplicationItem>();
      for (const candidate of candidates) {
        let covered = false;
        for (const other of candidates) {
          if (other === candidate) continue;
          const otherImpliesCandidate = kind === "ancestor"
            ? this.implies(other, candidate)
            : this.implies(candidate, other);
          if (otherImpliesCandidate) {
            covered = true;
            break;
          }
        }
        if (!covered) nearest.add(candidate);
      }
      result.set(item, nearest);
    }

    return result;
  }

  private buildFarthestMap(
    relation: Map<ImplicationItem, Set<ImplicationItem>>,
    kind: "ancestor" | "descendant",
  ): Map<ImplicationItem, Set<ImplicationItem>> {
    const result = new Map<ImplicationItem, Set<ImplicationItem>>();

    for (const [item, candidates] of relation) {
      const farthest = new Set<ImplicationItem>();
      for (const candidate of candidates) {
        let covered = false;
        for (const other of candidates) {
          if (other === candidate) continue;
          const candidateImpliesOther = kind === "ancestor"
            ? this.implies(candidate, other)
            : this.implies(other, candidate);
          if (candidateImpliesOther) {
            covered = true;
            break;
          }
        }
        if (!covered) farthest.add(candidate);
      }
      result.set(item, farthest);
    }

    return result;
  }

  private getPaths(
    from: ImplicationItem,
    to: ImplicationItem,
    direction: Direction,
    options: PathQueryOptions = {},
  ): string[][] {
    if (from === to) return [[from]];

    const adjacency = this.pathAdjacency(direction, options.explicit === true);
    const maxDepth = options.maxDepth ?? Math.max(1, this.items.size + 1);
    const maxPaths = options.maxPaths ?? Number.POSITIVE_INFINITY;
    const result: string[][] = [];
    const seenPathKeys = new Set<string>();

    const walk = (current: string, path: string[], visited: Set<string>) => {
      if (result.length >= maxPaths) return;
      if (path.length > maxDepth) return;
      for (const next of adjacency(current)) {
        if (visited.has(next)) continue;
        const nextPath = [...path, next];
        if (next === to) {
          const key = pathKeyOf(nextPath);
          if (!seenPathKeys.has(key)) {
            seenPathKeys.add(key);
            result.push(nextPath);
          }
          continue;
        }
        walk(next, nextPath, new Set([...visited, next]));
      }
    };

    walk(from, [from], new Set([from]));
    return this.keepLongestPaths(result);
  }

  private pathAdjacency(direction: Direction, explicit: boolean): (item: string) => Set<string> {
    if (explicit) {
      return (item) => {
        const result = new Set<string>();
        if (direction === "up" || direction === "all") unionInto(result, this.explicitNearestAncestors.get(item) ?? []);
        if (direction === "down" || direction === "all") unionInto(result, this.explicitNearestDescendants.get(item) ?? []);
        return result;
      };
    }

    const up = this.getNearestAncestorsMap();
    const down = this.getNearestDescendantsMap();
    return (item) => {
      const result = new Set<string>();
      if (direction === "up" || direction === "all") unionInto(result, up.get(item) ?? []);
      if (direction === "down" || direction === "all") unionInto(result, down.get(item) ?? []);
      return result;
    };
  }

  private keepLongestPaths(paths: string[][]): string[][] {
    let maxLength = 0;
    for (const path of paths) {
      if (path.length > maxLength) maxLength = path.length;
    }
    return paths.filter((path) => path.length === maxLength);
  }

  private findCycles(): { items: string[] }[] {
    const cycles: { items: string[] }[] = [];
    const seen = new Set<string>();

    for (const item of this.items) {
      const ancestors = this.impliedBy.get(item);
      if (ancestors == null) continue;
      for (const ancestor of ancestors) {
        if (item === ancestor) continue;
        if (this.impliedBy.get(ancestor)?.has(item) !== true) continue;
        const key = [item, ancestor].sort().join("\u0000");
        if (seen.has(key)) continue;
        seen.add(key);
        cycles.push({ items: [item, ancestor] });
      }
    }

    return cycles;
  }
}
