import { GraphQLFragment, GraphQLOperation, HookUsage } from '../types';
import { DocBinding } from '../parsers/graphql-files';
import { buildResolvers } from './component-map';

/**
 * Operations that no component ever executes. We resolve every hook usage back
 * to an operation and report the operations left with zero consumers.
 */
export function findDeadQueries(
  operations: GraphQLOperation[],
  fragments: GraphQLFragment[],
  usages: HookUsage[],
  bindings: DocBinding[]
): GraphQLOperation[] {
  const { resolveOp } = buildResolvers(operations, fragments, bindings);
  const used = new Set<GraphQLOperation>();
  for (const u of usages) {
    const op = resolveOp(u.documentIdentifier ?? u.operationName);
    if (op) used.add(op);
  }
  return operations.filter((op) => !used.has(op));
}
