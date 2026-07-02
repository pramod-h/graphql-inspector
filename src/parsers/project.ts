import { existsSync, readFileSync } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { ProjectInfo } from '../types';

const DEP_SIGNALS: Record<string, string> = {
  '@apollo/client': 'Apollo Client',
  'apollo-client': 'Apollo Client (legacy)',
  urql: 'urql',
  '@urql/core': 'urql',
  'graphql-request': 'graphql-request',
  'react-relay': 'Relay',
  'relay-runtime': 'Relay',
  '@graphql-codegen/cli': 'GraphQL Code Generator',
  graphql: 'graphql',
  next: 'Next.js',
  react: 'React',
  '@graphcommerce/magento-graphql': 'GraphCommerce (Magento)',
  '@apollo/experimental-nextjs-app-support': 'Apollo (Next App Router)',
};

const CONFIG_FILES = [
  'codegen.yml',
  'codegen.yaml',
  'codegen.ts',
  'codegen.json',
  '.graphqlrc',
  '.graphqlrc.yml',
  '.graphqlrc.yaml',
  '.graphqlrc.json',
  'graphql.config.js',
  'graphql.config.ts',
  'graphql.config.json',
  'apollo.config.js',
  'apollo.config.cjs',
  'relay.config.js',
];

function readPkg(root: string): Record<string, unknown> | null {
  const p = path.join(root, 'package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Best-effort location of a schema file (SDL or introspection JSON). */
function findSchema(root: string): string | null {
  const candidates = fg.sync(
    [
      'schema.graphql',
      'schema.json',
      '**/schema.graphql',
      '**/schema.json',
      '**/*.schema.graphql',
      '**/introspection.json',
    ],
    {
      cwd: root,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
      suppressErrors: true,
    }
  );
  return candidates[0] ?? null;
}

export function detectProject(root: string, schemaOverride?: string | null): ProjectInfo {
  const detected: string[] = [];
  const pkg = readPkg(root);
  let hasCodegen = false;

  if (pkg) {
    const deps = {
      ...(pkg.dependencies as object),
      ...(pkg.devDependencies as object),
    } as Record<string, string>;
    for (const [dep, label] of Object.entries(DEP_SIGNALS)) {
      if (deps[dep] && !detected.includes(label)) detected.push(label);
    }
    if (deps['@graphql-codegen/cli'] || deps['@graphql-codegen/typescript']) {
      hasCodegen = true;
    }
  }

  for (const cfg of CONFIG_FILES) {
    if (existsSync(path.join(root, cfg))) {
      if (cfg.startsWith('codegen')) hasCodegen = true;
      const label = `config: ${cfg}`;
      if (!detected.includes(label)) detected.push(label);
    }
  }

  const schemaPath =
    (schemaOverride && path.resolve(root, schemaOverride)) || findSchema(root);

  return { root, detected, hasCodegen, schemaPath: schemaPath || null };
}
