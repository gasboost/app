import { AppsScriptDescription } from "@gasboost/app";
import type { Plugin, ResolvedConfig } from "vite";
import { createGasboostConfig } from "./config";
import type { GasboostOptions } from "./gasboost";
import { createGlobalCode } from "./globals";
import { loadAppsScript } from "./loadAppsScript";

export function createBuildPlugin(options: GasboostOptions): Plugin {
  let config: ResolvedConfig;
  let analysis: AppsScriptDescription;

  return {
    name: "gasboost:build",
    apply: "build",

    config() {
      return createGasboostConfig(options);
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async buildStart() {
      analysis = await loadAppsScript(options, config);
    },

    generateBundle(_, bundle) {
      const globalCode = createGlobalCode(analysis);

      for (const output of Object.values(bundle)) {
        if (output.type === "chunk" && output.isEntry) {
          output.code = `${globalCode}\n\n${output.code}`;
        }
      }
    },
  };
}
