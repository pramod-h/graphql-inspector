import { GraphQLOperation } from '../types';

/**
 * Operations no code references. An operation is considered *alive* if any of
 * its document identifiers — the `gql` const name, the operation name, the
 * codegen `<Name>Document`, or a generated `use<Name>Query` hook — is
 * referenced as a value anywhere in the project (see `collectReferencedNames`).
 *
 * This is precision-biased on purpose: it won't flag a query as dead just
 * because we couldn't trace which hook runs it (custom wrapper hooks, Venia
 * operations-map indirection, duplicate definitions sharing a name). The cost
 * is missing some genuinely-dead queries; the benefit is not telling you to
 * delete live code.
 */
export function findDeadQueries(
  operations: GraphQLOperation[],
  referencedNames: Set<string>
): GraphQLOperation[] {
  return operations.filter((op) => {
    const ids = [op.varName, op.name, op.name ? `${op.name}Document` : null];
    return !ids.some((id) => id != null && referencedNames.has(id));
  });
}
