import path from 'path';
import { scan } from '../core/scan';
import { toJson } from '../reporters/json';
import * as term from '../reporters/terminal';
import { c, line, setQuiet, heading } from '../utils/logger';
import { ScanOptions } from '../types';
import { analyzeImpact } from '../analyzers/impact';

export interface CommonOpts {
  json?: boolean;
  schema?: string;
  ignore?: string[];
  generated?: string[];
}

function optionsFrom(pathArg: string | undefined, opts: CommonOpts): ScanOptions {
  return {
    cwd: path.resolve(pathArg ?? process.cwd()),
    schema: opts.schema ?? null,
    ignore: opts.ignore,
    generated: opts.generated,
  };
}

function run(pathArg: string | undefined, opts: CommonOpts) {
  setQuiet(!!opts.json);
  return scan(optionsFrom(pathArg, opts));
}

function maybeParseNote(count: number, json: boolean) {
  if (!json && count > 0) {
    line(c.dim(`\n(${count} document(s) could not be parsed and were skipped.)`));
  }
}

export function scanCommand(
  pathArg: string | undefined,
  opts: CommonOpts & { details?: boolean }
): void {
  const { analysis, parseErrors } = run(pathArg, opts);
  if (opts.json) return console.log(toJson(analysis));
  term.printFull(analysis, !!opts.details);
  maybeParseNote(parseErrors.length, false);
}

export function overfetchCommand(pathArg: string | undefined, opts: CommonOpts): void {
  const { analysis } = run(pathArg, opts);
  if (opts.json) return console.log(JSON.stringify(analysis.overfetch, null, 2));
  term.printOverfetch(analysis);
}

export function unusedCommand(pathArg: string | undefined, opts: CommonOpts): void {
  const { analysis } = run(pathArg, opts);
  if (opts.json) {
    return console.log(
      JSON.stringify(
        {
          deadQueries: analysis.deadQueries.map((o) => o.name ?? o.varName),
          deadFragments: analysis.deadFragments.map((f) => f.name),
          unusedVariables: analysis.operations
            .filter((o) => o.unusedVariables.length)
            .map((o) => ({ operation: o.name, variables: o.unusedVariables })),
        },
        null,
        2
      )
    );
  }
  term.printDeadQueries(analysis);
  term.printDeadFragments(analysis);
  term.printUnusedVariables(analysis);
}

export function complexityCommand(pathArg: string | undefined, opts: CommonOpts): void {
  const { analysis } = run(pathArg, opts);
  if (opts.json) return console.log(JSON.stringify(analysis.complexity, null, 2));
  term.printComplexity(analysis);
}

export function duplicatesCommand(pathArg: string | undefined, opts: CommonOpts): void {
  const { analysis } = run(pathArg, opts);
  if (opts.json)
    return console.log(
      JSON.stringify(
        { queries: analysis.duplicateQueries, fragments: analysis.duplicateFragments },
        null,
        2
      )
    );
  term.printDuplicates(analysis);
}

/** `impact <Type.field | fieldName | OperationName>` — blast radius of a field. */
export function impactCommand(
  target: string,
  pathArg: string | undefined,
  opts: CommonOpts
): void {
  const { analysis } = run(pathArg, opts);
  const result = analyzeImpact(analysis.operations, analysis.fragments, analysis.usages, target);

  if (opts.json) {
    return console.log(
      JSON.stringify(
        {
          target: result.target,
          affectedOperations: result.operations,
          affectedFragments: result.fragments,
          affectedComponents: result.components,
        },
        null,
        2
      )
    );
  }

  heading(`Impact of "${target}"`);
  line(`  Affected operations: ${c.bold(String(result.operations.length))}`);
  line(`  Affected fragments:  ${c.bold(String(result.fragments.length))}`);
  line(`  Affected components: ${c.bold(String(result.components.length))}`);
  for (const name of result.operations.slice(0, 30)) {
    line(`    · ${name}`);
  }
}

export function typesCommand(pathArg: string | undefined, opts: CommonOpts): void {
  setQuiet(!!opts.json);
  const { analysis } = scan({ ...optionsFrom(pathArg, opts), analyzeTypes: true });
  if (opts.json) return console.log(JSON.stringify(analysis.generatedTypes, null, 2));
  term.printGeneratedTypes(analysis);
}
