# @codilar/graphql-inspector

> Understand how your frontend **actually uses** GraphQL.

Not another linter, code generator, or schema validator. This tool analyzes the
relationship between **GraphQL operations → hooks → React components → the UI**,
and surfaces things the existing tooling can't:

- **Overfetching** — fields a query requests but the component never reads. ⭐
- **Dead queries** — operations no component executes.
- **Dead fragments** — fragments never spread anywhere.
- **Duplicate & near-duplicate** documents (e.g. `SearchProducts` vs `ProductSearch`, 98% identical).
- **Query complexity** — depth and field-count risk.
- **Schema drift** — requested fields that no longer exist in the schema.
- **Unused variables** — declared operation variables never referenced.
- **Impact** — the blast radius of a field across operations, fragments, and components.

Zero config. No server. No account. Runs locally.

```bash
npx @codilar/graphql-inspector            # summary for the current directory
npx @codilar/graphql-inspector --details  # every section
```

## Commands

```bash
graphql-inspector [path]                 # full report (add --details)
graphql-inspector overfetch [path]       # the differentiator ⭐
graphql-inspector unused [path]          # dead queries + fragments + variables
graphql-inspector complexity [path]      # depth / field-count risk
graphql-inspector duplicates [path]      # identical & near-identical docs
graphql-inspector impact <Type.field>    # affected operations/fragments/components
graphql-inspector types [path]           # unused GraphQL Code Generator types
```

Flags: `--json` (machine-readable), `--schema <path>` (SDL or introspection JSON,
enables schema-drift), `--ignore <globs...>`. `types` also takes
`--generated <globs...>` to point at codegen output when auto-detection misses it.

## What it understands

| Style | Support |
|---|---|
| `.graphql` / `.gql` files + GraphQL Code Generator | ✅ (resolves `FooDocument` → operation `Foo`) |
| `gql\`\`` / `graphql\`\`` tagged templates | ✅ (incl. `${Fragment}` interpolation) |
| Apollo Client (`useQuery`, `useMutation`, `useSuspenseQuery`, `useFragment`, …) | ✅ |
| urql (`useQuery({ query })`, `useMutation`) | ✅ |
| graphql-request (`request(url, DOC)`) | ✅ |
| Relay (`useLazyLoadQuery`, `useFragment`) | ✅ |
| TypeScript **and** plain JS/JSX | ✅ |

Field-read tracing handles optional chaining (`data?.a?.b`), destructuring
(incl. renamed `{ data: alias }`), `.map()/.filter()` callbacks, `onCompleted`
callbacks, local re-aliasing, and pass-through (objects handed to a child
component or returned from a custom hook are treated as **used**, so custom-hook
indirection doesn't produce false positives).

## How overfetch detection works (and its limits)

For each **query**, the tool inlines fragments to get the true requested field
set, then compares it against every field read in the components that run it.

- It is **precision-biased**: if it can't observe any field reads for a query
  (e.g. the result is only returned from a hook it can't follow), it reports
  nothing for that query rather than claiming everything is unused.
- Confidence is labeled: **high** = a whole top-level field is never referenced;
  **medium** = sibling fields are read but this one isn't.

This is a static heuristic, not a proof — review findings before deleting fields.

## Known limitations (v0.1)

This is a static heuristic. Where it can't see something, it errs toward *not*
crying wolf — but be aware:

- **Overfetch** doesn't follow reads across module boundaries or through custom
  hooks that return `data` (Venia "talons", etc.). It treats data returned/passed
  onward as *used*, so those show as fully used rather than false overfetch.
- **Dead queries** are detected by whether the document's identifier is
  referenced anywhere as a value (hook call, wrapper hook, operations-map,
  named import, generated hook). This handles custom-hook indirection and
  duplicate definitions, and is precision-biased — it won't call a query dead
  just because the exact hook couldn't be traced (so it may under-report).
- **Dead fragments** use spread-reachability from operations. A fragment spread
  only by a fragment defined in `node_modules` / another package can still show
  as dead — confirm before deleting.
- **Schema drift** requires an accurate, current schema (`--schema`). A stale or
  partial snapshot will produce noise.
- **Generated type usage** counts a type as used if it's reachable from app-code
  imports/type-references (following references between generated types). Types
  reached only via `export *` barrels or dynamic access may show as unused.

## Programmatic use

```ts
import { scan } from '@codilar/graphql-inspector';
const { analysis } = scan({ cwd: process.cwd() });
console.log(analysis.overfetch);
```

## Roadmap

- HTML report (`--html`), GitHub Action, and Claude integration.

## Development

```bash
yarn install
yarn dev overfetch ../some-graphql-project   # run from source
yarn build && yarn test
```

## License

MIT
