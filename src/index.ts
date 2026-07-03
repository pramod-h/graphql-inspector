/**
 * Programmatic API for @pramod_sh/graphql-inspector.
 *
 *   import { scan } from '@pramod_sh/graphql-inspector';
 *   const { analysis } = scan({ cwd: process.cwd() });
 */
export { scan } from './core/scan';
export type { ScanResult } from './core/scan';
export { runAnalysis } from './analyzers';
export { analyzeOverfetch } from './analyzers/overfetch';
export { mapComponents } from './analyzers/component-map';
export { buildModel, extractDefinitions } from './parsers/operations';
export { detectProject } from './parsers/project';
export { loadSchema } from './parsers/schema';
export { toJson } from './reporters/json';
export * from './types';
