import { AppsScriptJob } from "./AppsScriptJob";
import { AppsScriptJobRunner } from "./AppsScriptJobRunner";

export interface AppsScriptJobStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppsScriptJob<any>[];
}

export function appsScriptJobStore(
  runner: AppsScriptJobRunner,
): AppsScriptJobStore {
  return {
    subscribe: runner.subscribe.bind(runner),
    getSnapshot: runner.getJobs.bind(runner),
  };
}
