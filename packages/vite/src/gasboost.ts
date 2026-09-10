import type { Plugin } from "vite";
import { createBuildPlugin } from "./build";
import { createDevPlugin } from "./dev";

export type GasRuntime = Readonly<Record<string, unknown>>;

export interface GasboostOptions {
  entry: string;
  envDir?: string;
  runtime?: GasRuntime;
}

export function gasboost(options: GasboostOptions): {
  build: Plugin;
  dev: Plugin;
} {
  return {
    build: createBuildPlugin(options),
    dev: createDevPlugin(options),
  };
}
