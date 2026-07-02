# Changelog

## 0.2.0 — accuracy hardening

### Fixed
- **Dead-query false positives.** Detection is now based on whether a document's
  identifier is referenced anywhere as a *value* (hook call, custom wrapper
  hook, operations-map object, named import, or generated hook) instead of
  resolving each usage to a single operation object. This correctly handles
  duplicate operation definitions and custom-hook / Venia-talon indirection, and
  is precision-biased (won't call a query dead just because the exact hook
  couldn't be traced). Real-world impact: `frontend-ajmal` 89 → 69 dead queries,
  `highgate-graphcommerce` 25 → 7 — with the remainder verified genuinely unused.
- **Relay hooks misclassified.** `useLazyLoadQuery` / `usePreloadedQuery` matched
  the codegen generated-hook pattern (`use` + `LazyLoad` + `Query`) and were
  mislabeled; they're now recognized as Relay. Inline `graphql`…`` documents
  passed directly to a hook are resolved by operation/fragment name.
- **urql `useQuery` mis-parsed as Apollo.** `useQuery` exists in both clients;
  it's now disambiguated by argument shape (`{ query: DOC }` → urql), including
  `[{ data }]` and `[result]` tuple results.

### Added
- `types` command: unused GraphQL Code Generator type detection (reachability
  from application-code references, following references between generated
  types). `--generated <globs...>` overrides auto-detection.
- Tests for complexity, schema drift, impact, project detection, urql, and Relay
  (16 total).

## 0.1.0 — initial release
Overfetch analysis, dead queries/fragments, duplicate/near-duplicate detection,
query complexity, schema drift, unused variables, and field impact. Supports
`.graphql` + GraphQL Code Generator and `gql`` tagged templates across Apollo,
urql, graphql-request, and Relay, in TypeScript and plain JS/JSX.
