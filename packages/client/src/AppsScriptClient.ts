import { AppsScriptJob } from "./AppsScriptJob";
import { AppsScriptJobQueue } from "./AppsScriptJobQueue";
import { AppsScriptJobRunner } from "./AppsScriptJobRunner";
import { appsScriptJobStore } from "./AppsScriptJobStore";
import { google } from "./google";

type RpcResponse = {
  contents: string;
};

type RpcDefinition = {
  args: unknown[];
  result: unknown;
};

type RpcApp = Record<string, RpcDefinition>;

type AppsScriptClient<TApp extends RpcApp> = {
  [K in keyof TApp]: TApp[K] extends {
    args: infer TArgs extends unknown[];
    result: infer TResult;
  }
    ? (...args: TArgs) => Promise<TResult>
    : never;
};

export const appsScriptTransport = {
  call(name: string, args: unknown[]): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [name](...args);
    });
  },
};

interface AppsScriptJobs {
  start: <T>(label: string, execute: () => Promise<T>) => Promise<T>;
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppsScriptJob<any>[];
}

export function appsScriptClient<TApp extends RpcApp>(): {
  client: AppsScriptClient<TApp>;
  jobs: AppsScriptJobs;
} {
  const jobQueue = new AppsScriptJobQueue();
  const jobRunner = new AppsScriptJobRunner(jobQueue);
  const jobStore = appsScriptJobStore(jobRunner);

  const client = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== "string") {
          return undefined;
        }

        return (...args: unknown[]) => {
          return jobQueue.enqueue(property, async () => {
            const res = await appsScriptTransport.call(property, args);
            return JSON.parse(res.contents);
          });
        };
      },
    },
  ) as AppsScriptClient<TApp>;

  const jobs = {
    start: jobQueue.enqueue.bind(jobQueue),
    cancel: jobRunner.cancel.bind(jobRunner),
    retry: jobRunner.retry.bind(jobRunner),
    subscribe: jobStore.subscribe.bind(jobStore),
    getSnapshot: jobStore.getSnapshot.bind(jobStore),
  };

  return { client, jobs };
}
