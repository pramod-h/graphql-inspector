import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractTaggedTemplates } from '../src/parsers/graphql-files';
import { buildModel } from '../src/parsers/operations';
import { mapComponents } from '../src/analyzers/component-map';
import { analyzeOverfetch } from '../src/analyzers/overfetch';
import { findDeadQueries } from '../src/analyzers/dead-queries';
import { findDuplicates } from '../src/analyzers/duplicates';

function analyze(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: 2 /* react */ },
  });
  for (const [name, text] of Object.entries(files)) project.createSourceFile(name, text);
  const errors: any[] = [];
  const { defs, bindings } = extractTaggedTemplates(project, errors);
  const { operations, fragments } = buildModel(defs);
  const usages = mapComponents(project, operations, fragments, bindings);
  return { operations, fragments, usages, bindings, errors };
}

const QUERIES = `
import { gql } from '@apollo/client';
export const GET_USER = gql\`
  query GetUser {
    user { id name email avatar { url alt } }
  }
\`;
export const GET_POSTS = gql\`
  query GetPosts { posts { id title } }
\`;
`;

describe('overfetch analyzer', () => {
  it('flags requested fields the component never reads', () => {
    const { operations, fragments, usages, bindings } = analyze({
      'queries.ts': QUERIES,
      'UserCard.tsx': `
        import { useQuery } from '@apollo/client';
        import { GET_USER } from './queries';
        export function UserCard() {
          const { data } = useQuery(GET_USER);
          const name = data?.user?.name;
          return name;
        }
      `,
      // GET_POSTS is intentionally unused (dead query, not overfetch).
    });

    const findings = analyzeOverfetch(operations, fragments, usages, bindings);
    const user = findings.find((f) => f.operation === 'GetUser');
    expect(user).toBeTruthy();
    const unusedPaths = user!.unused.map((u) => u.path);
    expect(unusedPaths).toContain('user.id');
    expect(unusedPaths).toContain('user.email');
    expect(unusedPaths).toContain('user.avatar.url');
    expect(unusedPaths).not.toContain('user.name');
    expect(user!.estimatedReductionPct).toBeGreaterThan(50);
  });

  it('does NOT flag fields passed through wholesale (custom-hook / child component)', () => {
    const { operations, fragments, usages, bindings } = analyze({
      'queries.ts': QUERIES,
      'UserRaw.tsx': `
        import { useQuery } from '@apollo/client';
        import { GET_USER } from './queries';
        function render(x) { return x; }
        export function UserRaw() {
          const { data } = useQuery(GET_USER);
          return render(data?.user);
        }
      `,
    });
    const findings = analyzeOverfetch(operations, fragments, usages, bindings);
    // `data.user` handed to a function → whole subtree treated as used.
    expect(findings.find((f) => f.operation === 'GetUser')).toBeFalsy();
  });

  it('captures reads inside .map() callbacks', () => {
    const { operations, fragments, usages, bindings } = analyze({
      'q.ts': `
        import { gql } from '@apollo/client';
        export const LIST = gql\`query List { posts { id title body author { name } } }\`;
      `,
      'List.tsx': `
        import { useQuery } from '@apollo/client';
        import { LIST } from './q';
        export function List() {
          const { data } = useQuery(LIST);
          return data?.posts?.map(p => p.title);
        }
      `,
    });
    const findings = analyzeOverfetch(operations, fragments, usages, bindings);
    const f = findings.find((x) => x.operation === 'List');
    expect(f).toBeTruthy();
    const paths = f!.unused.map((u) => u.path);
    expect(paths).toContain('posts.id');
    expect(paths).toContain('posts.body');
    expect(paths).toContain('posts.author.name');
    expect(paths).not.toContain('posts.title'); // read inside the map callback
  });
});

describe('dead queries', () => {
  it('flags operations no component runs', () => {
    const { operations, fragments, usages, bindings } = analyze({
      'queries.ts': QUERIES,
      'UserCard.tsx': `
        import { useQuery } from '@apollo/client';
        import { GET_USER } from './queries';
        export function UserCard() { const { data } = useQuery(GET_USER); return data; }
      `,
    });
    const dead = findDeadQueries(operations, fragments, usages, bindings);
    expect(dead.map((o) => o.name)).toContain('GetPosts');
    expect(dead.map((o) => o.name)).not.toContain('GetUser');
  });
});

describe('duplicates & unused variables', () => {
  it('detects identical field sets and unused variables', () => {
    const { operations } = analyze({
      'dupes.ts': `
        import { gql } from '@apollo/client';
        export const A = gql\`query A { user { id name } }\`;
        export const B = gql\`query B { user { id name } }\`;
        export const C = gql\`query C($id: ID!, $unused: String) { node(id: $id) { id } }\`;
      `,
    });
    const dups = findDuplicates(operations);
    expect(dups.some((g) => g.similarity === 1 && g.members.length === 2)).toBe(true);

    const c = operations.find((o) => o.name === 'C');
    expect(c?.unusedVariables).toEqual(['unused']);
  });
});
