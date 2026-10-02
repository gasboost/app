# Tech Stack

- Package manager: pnpm, pinned by root `packageManager` to `pnpm@10.18.0`; workspace globs are `packages/*`.
- Language: TypeScript, root dev dependency `typescript ^7.0.2`; root `tsconfig.json` uses `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `skipLibCheck: true`.
- Test runner: Vitest, root dev dependency `vitest ^5.0.0`.
- `packages/app`: CommonJS package, depends on GAS and Node typings for development (`@types/google-apps-script`, `@types/node`) and uses Vite in dev dependencies. Typecheck also builds and checks consumer backend/frontend fixtures.
- `packages/client`: CommonJS-style published output via `dist`; Vitest config uses `jsdom` and `tests/setup.ts`.
- `packages/react`: CommonJS package, React peer dependency `^19`, depends on workspace `@gasboost/client`; TypeScript JSX mode is `react-jsx`; Vitest runs in `jsdom`.
- Published package exports point to `./dist/index.js` and `./dist/index.d.ts`; package build scripts remove `dist` then run package `tsconfig.build.json`.
