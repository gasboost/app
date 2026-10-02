# Conventions

- Public APIs are small named exports from package `src/index.ts`; keep implementation classes/modules package-local unless they are part of the package surface.
- Code style observed in sources/tests: 2-space indentation, double quotes, semicolons, explicit `public` on class methods/fields where used, type-only imports for types, terse method names aligned with domain verbs (`get`, `post`, `call`, `dispatch`, `sync`).
- `@gasboost/app` encodes API contracts heavily in TypeScript generics/overloads. Preserve type inference behavior, especially `InferAppsScript`, middleware state refinement, and object-or-undefined RPC input constraints.
- `@gasboost/app` RPC handlers use a single object input or `undefined`; tests assert invalid primitive/multi-arg contracts via type specs.
- `@gasboost/client` runtime client is Proxy-based: property access becomes an RPC call enqueued as a job, transport returns `RpcResponse.contents`, and client parses JSON before resolving typed results.
- `AppsScriptTransport` models GAS `google.script.run` success/failure handlers; no-input RPC calls invoke the server function with zero args.
- Job state is represented by an `AppsScriptJob` object with timestamp/result/error fields and status helpers (`pending`, `running`, `success`, `failed`). Cancellation only succeeds before a job starts.
- React package is intentionally UI-free: it adapts `AppsScriptHistoryPipeline` lifecycle and `AppsScriptJobStore` subscription; app-specific router UI/job UI stays outside this package.
- Tests include both runtime behavior specs and type-level specs using Vitest `expectTypeOf`; maintain both when changing contracts.
