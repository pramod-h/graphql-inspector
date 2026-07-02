import {
  parse,
  print,
  visit,
  Kind,
  DefinitionNode,
  SelectionSetNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
} from 'graphql';
import {
  DocSource,
  FieldNode,
  GraphQLFragment,
  GraphQLOperation,
  SourceLocation,
} from '../types';
import { fieldSetHash } from '../utils/hash';

/** Intermediate: a single definition extracted from a source, pre-resolution. */
export interface ParsedDef {
  node: OperationDefinitionNode | FragmentDefinitionNode;
  file: string;
  /** Line in the original file where the containing document/template starts. */
  startLine: number;
  source: DocSource;
  /** JS/TS identifier this document was assigned to, when known. */
  varName?: string | null;
}

export interface ParseError {
  file: string;
  line: number;
  message: string;
}

/**
 * Parse one GraphQL document string into its definitions. `startLine` is the
 * 1-based line in the original file where this text begins (for tagged
 * templates); 0 for standalone `.graphql` files.
 */
export function extractDefinitions(
  text: string,
  source: DocSource,
  file: string,
  startLine: number,
  errors: ParseError[]
): ParsedDef[] {
  let doc;
  try {
    doc = parse(text);
  } catch (e) {
    errors.push({
      file,
      line: startLine || 1,
      message: (e as Error).message.split('\n')[0],
    });
    return [];
  }
  const out: ParsedDef[] = [];
  for (const def of doc.definitions as DefinitionNode[]) {
    if (
      def.kind === Kind.OPERATION_DEFINITION ||
      def.kind === Kind.FRAGMENT_DEFINITION
    ) {
      out.push({ node: def, file, startLine, source });
    }
  }
  return out;
}

function locOf(def: ParsedDef): SourceLocation {
  const tok = def.node.loc?.startToken;
  const innerLine = tok?.line ?? 1;
  const line = def.startLine ? def.startLine + innerLine - 1 : innerLine;
  return { file: def.file, line, column: tok?.column ?? 1 };
}

/** Direct fragment spread names referenced anywhere in a selection set. */
function directSpreads(selectionSet: SelectionSetNode): string[] {
  const names = new Set<string>();
  visit(selectionSet, {
    FragmentSpread(n) {
      names.add(n.name.value);
    },
  });
  return Array.from(names);
}

/** Variable names ($x) actually referenced within a selection set. */
function usedVariables(selectionSet: SelectionSetNode): Set<string> {
  const names = new Set<string>();
  visit(selectionSet, {
    Variable(n) {
      names.add(n.name.value);
    },
  });
  return names;
}

/** Merge a field node into a list, unioning children on matching response keys. */
function mergeField(into: FieldNode[], node: FieldNode): void {
  const existing = into.find((f) => f.responseKey === node.responseKey);
  if (!existing) {
    into.push(node);
    return;
  }
  existing.hasSelection = existing.hasSelection || node.hasSelection;
  for (const child of node.children) mergeField(existing.children, child);
}

/**
 * Walk a selection set into a FieldNode tree, inlining fragment spreads and
 * inline fragments so that `path`s reflect the true requested response shape.
 */
function walk(
  selectionSet: SelectionSetNode,
  parentPath: string,
  fragments: Map<string, FragmentDefinitionNode>,
  seenFragments: Set<string>
): FieldNode[] {
  const result: FieldNode[] = [];
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      const responseKey = sel.alias?.value ?? sel.name.value;
      const path = parentPath ? `${parentPath}.${responseKey}` : responseKey;
      const hasSelection = !!sel.selectionSet;
      const children = hasSelection
        ? walk(sel.selectionSet!, path, fragments, seenFragments)
        : [];
      mergeField(result, {
        name: sel.name.value,
        responseKey,
        path,
        hasSelection,
        children,
      });
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      // Same level — merge the inline fragment's fields at parentPath.
      for (const node of walk(sel.selectionSet, parentPath, fragments, seenFragments)) {
        mergeField(result, node);
      }
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      const fragName = sel.name.value;
      const frag = fragments.get(fragName);
      if (frag && !seenFragments.has(fragName)) {
        const nextSeen = new Set(seenFragments).add(fragName);
        for (const node of walk(frag.selectionSet, parentPath, fragments, nextSeen)) {
          mergeField(result, node);
        }
      }
    }
  }
  return result;
}

function collectPaths(fields: FieldNode[]): { leaf: string[]; all: string[] } {
  const leaf: string[] = [];
  const all: string[] = [];
  const rec = (nodes: FieldNode[]) => {
    for (const n of nodes) {
      all.push(n.path);
      if (n.children.length === 0) leaf.push(n.path);
      else rec(n.children);
    }
  };
  rec(fields);
  return { leaf, all };
}

function treeDepth(fields: FieldNode[]): number {
  let max = 0;
  for (const n of fields) {
    max = Math.max(max, n.children.length ? 1 + treeDepth(n.children) : 1);
  }
  return max;
}

/**
 * Resolve a batch of parsed definitions into the full operation/fragment model,
 * inlining fragments across files.
 */
export function buildModel(defs: ParsedDef[]): {
  operations: GraphQLOperation[];
  fragments: GraphQLFragment[];
} {
  const fragmentNodes = new Map<string, FragmentDefinitionNode>();
  for (const d of defs) {
    if (d.node.kind === Kind.FRAGMENT_DEFINITION) {
      fragmentNodes.set(d.node.name.value, d.node);
    }
  }

  const operations: GraphQLOperation[] = [];
  const fragments: GraphQLFragment[] = [];

  for (const d of defs) {
    const fields = walk(d.node.selectionSet, '', fragmentNodes, new Set());
    const { leaf, all } = collectPaths(fields);
    const depth = treeDepth(fields);
    const spreads = directSpreads(d.node.selectionSet);
    const loc = locOf(d);
    const rawText = print(d.node);

    if (d.node.kind === Kind.OPERATION_DEFINITION) {
      const op = d.node;
      const declared = (op.variableDefinitions ?? []).map((v) => v.variable.name.value);
      const used = usedVariables(op.selectionSet);
      operations.push({
        kind: 'operation',
        name: op.name?.value ?? null,
        operation: op.operation,
        variables: declared,
        unusedVariables: declared.filter((v) => !used.has(v)),
        fields,
        leafPaths: leaf,
        allPaths: all,
        fragmentSpreads: spreads,
        depth,
        loc,
        source: d.source,
        rawText,
        fieldSetHash: fieldSetHash(leaf, op.operation),
        varName: d.varName ?? null,
      });
    } else {
      const frag = d.node;
      fragments.push({
        kind: 'fragment',
        name: frag.name.value,
        typeCondition: frag.typeCondition.name.value,
        fields,
        leafPaths: leaf,
        allPaths: all,
        fragmentSpreads: spreads,
        depth,
        loc,
        source: d.source,
        rawText,
        fieldSetHash: fieldSetHash(leaf, frag.typeCondition.name.value),
        varName: d.varName ?? null,
      });
    }
  }

  return { operations, fragments };
}
