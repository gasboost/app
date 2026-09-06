import type { Plugin } from "vite";
import { createBuildPlugin } from "./build";
import { createDevPlugin } from "./dev";

export interface GasboostOptions {
  entry: string;
  envDir?: string;
}

export function gasboost(options: GasboostOptions): {
  build: Plugin;
  dev: Plugin;
} {
  return {
    build: createBuildPlugin(options),
    dev: createDevPlugin(options.entry),
  };
}
