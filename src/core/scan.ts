import { Project } from 'ts-morph';
import { AnalysisResult, ScanOptions } from '../types';
import { detectProject } from '../parsers/project';
import { loadSchema } from '../parsers/schema';
import { buildModel, ParseError } from '../parsers/operations';
import {
  DEFAULT_IGNORE,
  extractGraphqlFiles,
  extractTaggedTemplates,
} from '../parsers/graphql-files';
import { mapComponents } from '../analyzers/component-map';
import { runAnalysis } from '../analyzers';
import { spinner } from '../utils/logger';

export interface ScanResult {
  analysis: AnalysisResult;
  parseErrors: ParseError[];
}

/**
 * The end-to-end pipeline:
 *   detect → build source project → scan GraphQL → parse model →
 *   map components → run analyzers.
 */
export function scan(options: ScanOptions): ScanResult {
  const root = options.cwd;
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
  const parseErrors: ParseError[] = [];

  const sp = spinner('Detecting project…');
  const project = detectProject(root, options.schema);
  const schema = loadSchema(options.schema ?? project.schemaPath);

  sp.text = 'Loading source files…';
  const tsProject = new Project({
    compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  tsProject.addSourceFilesAtPaths([
    `${root}/**/*.{ts,tsx,js,jsx}`,
    `!${root}/**/node_modules/**`,
    `!${root}/**/dist/**`,
    `!${root}/**/.next/**`,
    `!${root}/**/build/**`,
  ]);
  const sourceFileCount = tsProject.getSourceFiles().length;

  sp.text = 'Scanning GraphQL documents…';
  const fileDefs = extractGraphqlFiles(root, ignore, parseErrors);
  const { defs: templateDefs, bindings } = extractTaggedTemplates(tsProject, parseErrors);
  const allDefs = [...fileDefs, ...templateDefs];

  sp.text = 'Building operation model…';
  const { operations, fragments } = buildModel(allDefs);

  sp.text = 'Mapping components → operations…';
  const usages = mapComponents(tsProject, operations, fragments, bindings);
  const components = new Set(usages.map((u) => `${u.file}:${u.component}`)).size;

  sp.text = 'Running analyzers…';
  const analysis = runAnalysis({
    project,
    operations,
    fragments,
    usages,
    bindings,
    schema,
    stats: {
      graphqlFiles: fileDefs.length,
      sourceFiles: sourceFileCount,
      components,
    },
  });

  sp.succeed('Analysis complete');
  return { analysis, parseErrors };
}
