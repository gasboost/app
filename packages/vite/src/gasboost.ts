import type { Plugin } from "vite";
import type { AppsScriptAnalysis } from "./analyzer";
import { analyzeAppsScript } from "./analyzer";
import { createGasboostConfig } from "./config";
import { createGlobalCode } from "./globals";

export interface GasboostOptions {
  entry: string;
  envDir?: string;
}

export function gasboost(options: GasboostOptions): Plugin {
  let analysis: AppsScriptAnalysis;

  return {
    name: "gasboost",

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
          output.code += `\n${globalCode}`;
        }
      }
    },
  };
}
