import { GraphQLFragment, GraphQLOperation, HookUsage } from '../types';

export interface ImpactResult {
  target: string;
  /** Field name the target resolves to (last segment of `Type.field`). */
  field: string;
  operations: string[];
  fragments: string[];
  components: string[];
}

/**
 * Blast radius of a field: which operations/fragments request it and which
 * components run those operations. Matches by field name (the last segment of
 * a `Type.field` target), case-insensitively, against any path segment.
 */
export function analyzeImpact(
  operations: GraphQLOperation[],
  fragments: GraphQLFragment[],
  usages: HookUsage[],
  target: string
): ImpactResult {
  const field = target.includes('.') ? target.split('.').pop()! : target;
  const lc = field.toLowerCase();
  const matches = (paths: string[]) =>
    paths.some((p) => p.split('.').some((seg) => seg.toLowerCase() === lc));

  const affectedOps = operations.filter((o) => matches(o.allPaths));
  const affectedFrags = fragments.filter((f) => matches(f.allPaths));
  const opNames = new Set(
    affectedOps.map((o) => (o.name ?? o.varName)?.toLowerCase()).filter(Boolean)
  );
  const components = Array.from(
    new Set(
      usages
        .filter((u) => opNames.has((u.operationName ?? '').toLowerCase()))
        .map((u) => u.component)
    )
  );

  return {
    target,
    field,
    operations: affectedOps.map((o) => o.name ?? o.varName ?? '(anonymous)'),
    fragments: affectedFrags.map((f) => f.name),
    components,
  };
}
