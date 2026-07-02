import { GraphQLFragment, GraphQLOperation } from '../types';

/** Transitive closure of fragment names reachable from a set of spread names. */
export function closureForSpreads(
  spreads: string[],
  fragByName: Map<string, GraphQLFragment>
): Set<string> {
  const seen = new Set<string>();
  const stack = [...spreads];
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const frag = fragByName.get(name);
    if (frag) stack.push(...frag.fragmentSpreads);
  }
  return seen;
}

/**
 * Fragments never reached from any operation (directly or transitively through
 * other fragments). By GraphQL semantics an un-spread fragment is inert, so
 * spread-reachability is the correct definition of "dead".
 */
export function findDeadFragments(
  operations: GraphQLOperation[],
  fragments: GraphQLFragment[]
): GraphQLFragment[] {
  const fragByName = new Map(fragments.map((f) => [f.name, f]));
  const reachable = new Set<string>();
  for (const op of operations) {
    for (const name of closureForSpreads(op.fragmentSpreads, fragByName)) {
      reachable.add(name);
    }
  }
  return fragments.filter((f) => !reachable.has(f.name));
}
