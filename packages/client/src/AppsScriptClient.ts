import {
  resolveMetadata,
  type MetadataProvider,
  type RpcCallOptions,
} from "./RpcMetadata";
import { AppsScriptTransport } from "./AppsScriptTransport";
import { AppsScriptJob } from "./job/AppsScriptJob";
import { AppsScriptJobQueue } from "./job/AppsScriptJobQueue";
import { AppsScriptJobRunner } from "./job/AppsScriptJobRunner";
import { appsScriptJobStore } from "./job/AppsScriptJobStore";
import type { Transport } from "./Transport";

type RpcDefinition = {
  input: unknown;
  result: unknown;
};

type RpcApp = Record<string, RpcDefinition>;

export type AppsScriptClient<TApp extends RpcApp> = {
  [K in keyof TApp]: [TApp[K]["input"]] extends [undefined]
    ? (
        input?: undefined,
        options?: RpcCallOptions,
      ) => Promise<TApp[K]["result"]>
    : (
        input: TApp[K]["input"],
        options?: RpcCallOptions,
      ) => Promise<TApp[K]["result"]>;
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
  metadataProviders?: readonly MetadataProvider[];
}

export function appsScriptClient<TApp extends RpcApp>({
  transport = new AppsScriptTransport(),
  metadataProviders = [],
}: AppsScriptClientOptions = {}): {
  client: AppsScriptClient<TApp>;
  jobs: AppsScriptJobs;
} {
  const jobQueue = new AppsScriptJobQueue();
  const jobRunner = new AppsScriptJobRunner(jobQueue);
  const jobStore = appsScriptJobStore(jobRunner);

  // Derived clients share the transport and jobs, but never mutate each other's providers.
  function createClient(
    providers: readonly MetadataProvider[],
  ): AppsScriptClient<TApp> {
    const methods = new Map<string, unknown>();
    const client = new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property !== "string") return undefined;
          if (!methods.has(property)) {
            methods.set(property, (input?: unknown, options?: RpcCallOptions) =>
              jobQueue.enqueue(property, async () => {
                // Resolve for every execution, including queued jobs and retries.
                const metadata = resolveMetadata(providers, options?.metadata);
                const response =
                  metadata === undefined
                    ? await transport.call(property, input)
                    : await transport.call(property, input, metadata);
                return JSON.parse(response.contents);
              }),
            );
          }
          return methods.get(property);
        },
      },
    ) as AppsScriptClient<TApp>;
    metadataClients.set(client, (additional) =>
      createClient([...providers, ...additional]),
    );
    return client;
  }

  const client = createClient([...metadataProviders]);

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

const metadataClients = new WeakMap<
  object,
  (providers: readonly MetadataProvider[]) => object
>();

/** Add scoped providers to a Gasboost client while preserving its RPC contract and jobs. */
export function withMetadataProviders<TClient extends object>(
  client: TClient,
  providers: readonly MetadataProvider[],
): TClient {
  const bind = metadataClients.get(client);
  if (!bind)
    throw new Error(
      "withMetadataProviders requires a client created by appsScriptClient.",
    );
  return bind(providers) as TClient;
}
