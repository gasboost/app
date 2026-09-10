import type { AppsScript, AppsScriptDescription } from "@gasboost/app";
import {
  createServer,
  isRunnableDevEnvironment,
  type ResolvedConfig,
} from "vite";
import type { GasboostOptions } from "./gasboost";
import { installGasRuntime } from "./runtime";

type AppsScriptModule = {
  default: AppsScript;
};

export async function loadAppsScript(
  options: GasboostOptions,
  config: ResolvedConfig,
): Promise<AppsScriptDescription> {
  installGasRuntime(options.runtime);

  const server = await createServer({
    configFile: false,
    root: config.root,
    mode: config.mode,
    envDir: options.envDir,
    appType: "custom",

    ssr: {
      external: ["@gasboost/app"],
    },

    server: {
      middlewareMode: true,
      hmr: false,
    },
  });

  try {
    const environment = server.environments.ssr;

    if (!isRunnableDevEnvironment(environment)) {
      throw new Error("Vite SSR environment is not runnable.");
    }

    const module = (await environment.runner.import(
      options.entry,
    )) as AppsScriptModule;

    if (!module.default) {
      throw new Error("AppsScript entry must have a default export.");
    }

    return module.default.describe();
  } finally {
    await server.close();
  }
}
