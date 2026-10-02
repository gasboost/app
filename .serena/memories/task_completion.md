# Task Completion

- For broad or cross-package changes, run from repo root:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- For package-local changes, run the matching filter commands at minimum, e.g. `pnpm --filter @gasboost/client typecheck && pnpm --filter @gasboost/client test`; add `build` when public types or emitted JS may change.
- Changes in `packages/app` type contracts should include `pnpm --filter @gasboost/app typecheck` because it builds and checks consumer backend/frontend fixtures.
- Changes in React hooks/router should include `pnpm --filter @gasboost/react test` under jsdom plus the React package typecheck.
- After creating/updating Serena memories, run `serena memories check /Users/oshima/MyDX/gas-boost/app`.
