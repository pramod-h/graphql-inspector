import { ComplexityReport, GraphQLOperation } from '../types';

const DEPTH_HIGH = 8;
const DEPTH_MED = 5;
const NESTED_HIGH = 15;
const NESTED_MED = 8;

/**
 * Per-operation complexity: nesting depth, number of sub-selections, and total
 * field count. Exact list-nesting needs a schema; without one, sub-selection
 * count is a good proxy for "this query fans out a lot".
 */
export function analyzeComplexity(operations: GraphQLOperation[]): ComplexityReport[] {
  return operations
    .map((op) => {
      const fieldCount = op.allPaths.length;
      const nestedSelections = op.allPaths.length - op.leafPaths.length;
      const risk: ComplexityReport['risk'] =
        op.depth >= DEPTH_HIGH || nestedSelections >= NESTED_HIGH
          ? 'high'
          : op.depth >= DEPTH_MED || nestedSelections >= NESTED_MED
          ? 'medium'
          : 'low';
      return {
        operation: op.name ?? op.varName ?? '(anonymous)',
        file: op.loc.file,
        line: op.loc.line,
        depth: op.depth,
        nestedSelections,
        fieldCount,
        risk,
      };
    })
    .sort((a, b) => b.depth - a.depth || b.fieldCount - a.fieldCount);
}
