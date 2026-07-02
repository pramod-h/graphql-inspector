import {
  parse,
  validate,
  GraphQLSchema,
  FieldsOnCorrectTypeRule,
  KnownTypeNamesRule,
  KnownArgumentNamesRule,
} from 'graphql';
import { GraphQLFragment, GraphQLOperation, SchemaDriftFinding } from '../types';
import { closureForSpreads } from './dead-fragments';

// Only the rules that surface "the frontend asks for something the schema no
// longer has" — the essence of schema drift. Everything else would be noise.
const DRIFT_RULES = [FieldsOnCorrectTypeRule, KnownTypeNamesRule, KnownArgumentNamesRule];

/**
 * Validate each operation (with the fragments it needs) against the live schema
 * and report fields/types/arguments the schema no longer recognizes.
 */
export function analyzeSchemaDrift(
  schema: GraphQLSchema | null,
  operations: GraphQLOperation[],
  fragments: GraphQLFragment[]
): SchemaDriftFinding[] {
  if (!schema) return [];
  const fragByName = new Map(fragments.map((f) => [f.name, f]));
  const findings: SchemaDriftFinding[] = [];

  for (const op of operations) {
    const needed = closureForSpreads(op.fragmentSpreads, fragByName);
    const fragText = Array.from(needed)
      .map((n) => fragByName.get(n)?.rawText)
      .filter(Boolean)
      .join('\n\n');
    const combined = `${op.rawText}\n\n${fragText}`;

    let doc;
    try {
      doc = parse(combined);
    } catch {
      continue; // interpolation-stripped text may not always re-parse cleanly
    }

    let errors;
    try {
      errors = validate(schema, doc, DRIFT_RULES);
    } catch {
      continue;
    }

    const seen = new Set<string>();
    for (const err of errors) {
      const msg = err.message.split('\n')[0];
      if (seen.has(msg)) continue;
      seen.add(msg);
      findings.push({
        operation: op.name ?? op.varName ?? '(anonymous)',
        file: op.loc.file,
        line: op.loc.line,
        message: msg,
      });
    }
  }

  return findings;
}
