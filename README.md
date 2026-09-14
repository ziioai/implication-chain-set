# implication-chain-set

Build and query transitive implication relationships from ordered chains,
trees, and directed graphs.

In this package, a more specific item implies a more general item. For the
chain `animal -> mammal -> cat`, `cat` implies both `mammal` and `animal`.

## Install

```sh
pnpm add implication-chain-set
```

`implication-chain-set` is ESM-only and supports Node.js 20 or newer.

## Quick start

```ts
import { ImplicationChainSet } from "implication-chain-set";

const implications = new ImplicationChainSet()
  .addChain(["animal", "mammal", "human"])
  .addChain(["animal", "feline", "cat"])
  .addDescendantsTo("living thing", ["animal"]);

implications.implies("cat", "animal"); // true
implications.getNearestAncestors("cat"); // Set { "feline" }
implications.getFarthestAncestors("cat"); // Set { "living thing" }
implications.getUpPaths("cat", "living thing");
// [["cat", "feline", "animal", "living thing"]]
```

## Add relationships

- `addChain(chain)` and `addChains(chains)` accept general-to-specific ordered
  chains and derive their transitive implication closure.
- `addTree(tree)` and `addTrees(trees)` accept nested `{ name, children }`
  nodes. Parent-child relationships are recorded as explicit edges.
- `addGraph(graph)` and `addGraphs(graphs)` accept `{ nodes, edges }`, where an
  edge `{ from, to }` means `to` implies `from`.
- `addDescendantsTo(ancestor, descendants)` and
  `addAncestorsTo(descendant, ancestors)` add explicit edges directly.

Chains provide ordering evidence but do not create explicit edges. Use trees,
graphs, or the explicit ancestor/descendant methods when explicit-path queries
must preserve the input edges.

## Query relationships

- `implies(from, to)` includes reflexive implication: every item implies itself.
- `getImpliedItems(from)` returns all ancestors implied by `from`.
- `getItemsImplying(to)` returns all descendants that imply `to`.
- `getNearestAncestors` / `getNearestDescendants` return the transitive
  reduction inferred from all known relationships.
- `getFarthestAncestors` / `getFarthestDescendants` return the outermost known
  items.
- Methods prefixed with `getExplicit` only inspect explicitly added edges.

Returned sets and `items` are detached snapshots, so modifying them never
changes the `ImplicationChainSet`.

## Query paths

`getUpPaths`, `getDownPaths`, and `getAllPaths` return the longest matching
simple paths. Their `getExplicit...` counterparts use only explicit edges.

Every path method accepts an optional third argument:

```ts
implications.getUpPaths("cat", "animal", {
  maxDepth: 4, // maximum edges traversed
  maxPaths: 10, // maximum matches collected
});
```

Both limits must be non-negative integers. A `maxPaths` value of `0` returns no
paths.

## Diagnostics

`getDiagnostics()` reports implication cycles. Each cycle contains one sorted
strongly connected component:

```ts
const cyclic = new ImplicationChainSet()
  .addDescendantsTo("A", ["B"])
  .addDescendantsTo("B", ["C"])
  .addDescendantsTo("C", ["A"]);

cyclic.getDiagnostics();
// { cycles: [{ items: ["A", "B", "C"] }] }
```

## Development

```sh
pnpm install
pnpm run verify
```

`verify` checks source and test types, runs the test suite, builds the package,
and installs the generated tarball into an isolated consumer project.

## License

MIT
