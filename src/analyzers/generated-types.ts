import { Project, Node, SyntaxKind } from 'ts-morph';
import fg from 'fast-glob';
import { GeneratedTypesReport } from '../types';

/** Codegen plumbing types that aren't domain types — counting them is noise. */
const CODEGEN_HELPERS = new Set([
  'Maybe',
  'InputMaybe',
  'Exact',
  'MakeOptional',
  'MakeMaybe',
  'MakeEmpty',
  'Incremental',
  'Scalars',
]);

/** Heuristic: does this path look like GraphQL Code Generator output? */
export function isGeneratedPath(p: string): boolean {
  return (
    p.endsWith('.generated.ts') ||
    p.endsWith('.generated.tsx') ||
    p.endsWith('.gql.ts') ||
    p.endsWith('.gql.tsx') ||
    /\/generated\//.test(p) ||
    /\/gql\/(graphql|index)\.tsx?$/.test(p) ||
    p.endsWith('graphql.generated.ts') ||
    p.endsWith('types.generated.ts')
  );
}

interface GenExport {
  name: string;
  kind: 'type' | 'value';
  file: string;
  line: number;
  node: Node;
}

/**
 * Report on GraphQL Code Generator output: how many generated types the app
 * actually uses.
 *
 * A generated type counts as "used" if it is reachable from application-code
 * references. We seed with the generated exports imported by non-generated
 * files, then follow references *between* generated declarations — so a
 * fragment type used only inside a query type the app imports (or a `XQuery`
 * type reachable through a used `XDocument` const) is correctly counted as
 * used, not flagged as dead.
 */
export function analyzeGeneratedTypes(
  project: Project,
  root: string,
  override?: string[]
): GeneratedTypesReport {
  let overrideSet: Set<string> | null = null;
  if (override && override.length) {
    const files = fg.sync(override, {
      cwd: root,
      absolute: true,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
    });
    overrideSet = new Set(files);
  }

  const all = project.getSourceFiles();
  const generated = all.filter((sf) =>
    overrideSet ? overrideSet.has(sf.getFilePath()) : isGeneratedPath(sf.getFilePath())
  );
  if (!generated.length) {
    return { found: false, generatedFiles: 0, total: 0, used: 0, unused: [], usagePct: 0 };
  }
  const generatedSet = new Set(generated.map((sf) => sf.getFilePath()));

  // 1) Collect exported declarations (types AND value consts like `XDocument`).
  const exportsByName = new Map<string, GenExport>();
  const record = (name: string, kind: 'type' | 'value', node: Node, file: string) => {
    if (!exportsByName.has(name)) {
      exportsByName.set(name, { name, kind, file, line: node.getStartLineNumber(), node });
    }
  };
  for (const sf of generated) {
    const file = sf.getFilePath();
    for (const ta of sf.getTypeAliases()) if (ta.isExported()) record(ta.getName(), 'type', ta, file);
    for (const it of sf.getInterfaces()) if (it.isExported()) record(it.getName(), 'type', it, file);
    for (const en of sf.getEnums()) if (en.isExported()) record(en.getName(), 'type', en, file);
    for (const vs of sf.getVariableStatements()) {
      if (!vs.isExported()) continue;
      for (const d of vs.getDeclarations()) record(d.getName(), 'value', d, file);
    }
  }
  const genNames = new Set(exportsByName.keys());

  // 2) Reference edges between generated declarations (by identifier name).
  const edges = new Map<string, Set<string>>();
  for (const [name, ex] of exportsByName) {
    const refs = new Set<string>();
    for (const id of ex.node.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const t = id.getText();
      if (t !== name && genNames.has(t)) refs.add(t);
    }
    edges.set(name, refs);
  }

  // 3) Seeds: generated exports referenced by application (non-generated) code.
  const appRefs = new Set<string>();
  for (const sf of all) {
    if (generatedSet.has(sf.getFilePath())) continue;
    for (const imp of sf.getImportDeclarations()) {
      for (const ni of imp.getNamedImports()) appRefs.add(ni.getNameNode().getText());
    }
    for (const tr of sf.getDescendantsOfKind(SyntaxKind.TypeReference)) {
      const last = tr.getTypeName().getText().split('.').pop();
      if (last) appRefs.add(last);
    }
  }

  // 4) Reachability closure.
  const used = new Set<string>();
  const stack = [...genNames].filter((n) => appRefs.has(n));
  while (stack.length) {
    const n = stack.pop()!;
    if (used.has(n)) continue;
    used.add(n);
    for (const r of edges.get(n) ?? []) if (!used.has(r)) stack.push(r);
  }

  // 5) Report over domain type declarations only.
  const typeDecls = [...exportsByName.values()].filter(
    (e) => e.kind === 'type' && !CODEGEN_HELPERS.has(e.name)
  );
  const unused = typeDecls
    .filter((e) => !used.has(e.name))
    .map((e) => ({ name: e.name, file: e.file, line: e.line }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = typeDecls.length;
  const usedCount = total - unused.length;

  return {
    found: true,
    generatedFiles: generated.length,
    total,
    used: usedCount,
    unused,
    usagePct: total ? Math.round((usedCount / total) * 100) : 0,
  };
}
