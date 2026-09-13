import { AppsScriptTransport } from "./AppsScriptTransport";
import { AppsScriptJob } from "./job/AppsScriptJob";
import { AppsScriptJobQueue } from "./job/AppsScriptJobQueue";
import { AppsScriptJobRunner } from "./job/AppsScriptJobRunner";
import { appsScriptJobStore } from "./job/AppsScriptJobStore";
import type { Transport } from "./Transport";

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

interface AppsScriptJobs {
  start: <T>(label: string, execute: () => Promise<T>) => Promise<T>;
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppsScriptJob<any>[];
}

export interface AppsScriptClientOptions {
  transport?: Transport;
}

export function appsScriptClient<TApp extends RpcApp>({
  transport = new AppsScriptTransport(),
}: AppsScriptClientOptions = {}): {
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
            const response = await transport.call(property, args);

            return JSON.parse(response.contents);
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

  return {
    client,
    jobs,
  };
}
