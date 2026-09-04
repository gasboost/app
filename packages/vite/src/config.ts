import path from "node:path";

import type { UserConfig } from "vite";

import type { GasboostOptions } from "./gasboost";

export function createGasboostConfig(options: GasboostOptions): UserConfig {
  const entry = path.resolve(options.entry);

  return {
    envDir: options.envDir,

    build: {
      target: "es2019",
      outDir: "dist",
      emptyOutDir: false,

      rollupOptions: {
        input: entry,

        output: {
          format: "cjs",
          entryFileNames: path.basename(entry, path.extname(entry)) + ".js",
        },
      },
    },
  };
}
