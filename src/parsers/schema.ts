import fs from 'fs';
import {
  buildSchema,
  buildClientSchema,
  GraphQLSchema,
  IntrospectionQuery,
} from 'graphql';

/**
 * Load a GraphQL schema from an SDL (`.graphql`) or introspection (`.json`)
 * file. Returns null (rather than throwing) so schema-dependent analyzers can
 * degrade gracefully when no schema is present.
 */
export function loadSchema(schemaPath: string | null): GraphQLSchema | null {
  if (!schemaPath || !fs.existsSync(schemaPath)) return null;
  try {
    const raw = fs.readFileSync(schemaPath, 'utf8');
    if (schemaPath.endsWith('.json')) {
      const json = JSON.parse(raw);
      const data = (json.data ?? json) as IntrospectionQuery;
      return buildClientSchema(data);
    }
    return buildSchema(raw);
  } catch {
    return null;
  }
}
