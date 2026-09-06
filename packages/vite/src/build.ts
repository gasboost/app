import type { Plugin } from "vite";

import type { AppsScriptAnalysis } from "./analyzer";
import { analyzeAppsScript } from "./analyzer";
import { createGasboostConfig } from "./config";
import type { GasboostOptions } from "./gasboost";
import { createGlobalCode } from "./globals";

export function createBuildPlugin(options: GasboostOptions): Plugin {
  let analysis: AppsScriptAnalysis;

  return {
    name: "gasboost:build",
    apply: "build",

    config() {
      return createGasboostConfig(options);
    },

    buildStart() {
      analysis = analyzeAppsScript(options.entry);
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
