# Suggested Commands

- Install/update dependencies: `pnpm install`.
- Whole workspace checks from repo root:
  - `pnpm test` -> `pnpm -r run test`.
  - `pnpm typecheck` -> `pnpm -r run typecheck`.
  - `pnpm build` -> `pnpm -r run build`.
- Package-scoped checks:
  - `pnpm --filter @gasboost/app test`, `pnpm --filter @gasboost/app typecheck`, `pnpm --filter @gasboost/app build`.
  - `pnpm --filter @gasboost/client test`, `pnpm --filter @gasboost/client typecheck`, `pnpm --filter @gasboost/client build`.
  - `pnpm --filter @gasboost/react test`, `pnpm --filter @gasboost/react typecheck`, `pnpm --filter @gasboost/react build`.
- Serena memory integrity after onboarding or memory edits: `serena memories check /Users/oshima/MyDX/gas-boost/app` from the project root.
- Prefer `rg` / `rg --files` for code search; repo is on macOS/zsh but standard Unix command forms apply.
