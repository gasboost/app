# Core

- Monorepo for `gasboost/app`: TypeScript libraries for building Google Apps Script apps with typed backend runtime, RPC client, and React integration.
- Workspace packages:
  - `packages/app`: `@gasboost/app`, GAS backend runtime. Defines GET/POST handlers, RPC registration, middleware, invocation context/state, request wrappers, and `InferAppsScript` contract extraction.
  - `packages/client`: `@gasboost/client`, framework-neutral frontend client. Wraps `google.script.run` and fetch transports; includes job queue/runner/store and GAS container/iframe history synchronization.
  - `packages/react`: `@gasboost/react`, React 19 bindings around client history pipeline and job store.
- Public distribution for these packages is CommonJS via `dist`; `@gasboost/vite` is intentionally outside this repo and maintained in `gasboost/dev`.
- Root entry README describes the package chain: React -> `@gasboost/react` -> `@gasboost/client` -> `google.script.run` -> Google Apps Script -> `@gasboost/app`.
- Source roots are package-local `src`; tests are package-local `tests`. Build output `dist` and package `node_modules` exist in the tree but are generated/vendor artifacts.
- Read `mem:tech_stack` for tooling/version pins, `mem:conventions` for code patterns, `mem:suggested_commands` for useful commands, and `mem:task_completion` before considering code changes done.
