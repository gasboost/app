import type { AppsScript } from "@gasboost/app";
import type { IncomingMessage } from "node:http";
import { type Plugin, isRunnableDevEnvironment } from "vite";
import type { GasboostOptions } from "./gasboost";
import { installGasRuntime } from "./runtime";

type RpcRequestBody = {
  args: unknown[];
};

class InvalidRpcRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRpcRequestError";
  }
}

const CLIENT_MODULE_ID = "@gasboost/client";
const VIRTUAL_CLIENT_MODULE_ID = "\0gasboost:client";
const LOCAL_RPC_ENDPOINT = "/__gasboost";

export function createDevPlugin(options: GasboostOptions): Plugin {
  const { runtime, template } = options;

  let resolvedClientModuleId: string | undefined;

  return {
    name: "gasboost:dev",
    apply: "serve",
    enforce: "pre",

    async resolveId(source, importer, resolveOptions) {
      if (source !== CLIENT_MODULE_ID) {
        return null;
      }

      if (this.environment.config.consumer !== "client") {
        return null;
      }

      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      });

      if (!resolved) {
        return null;
      }

      resolvedClientModuleId = resolved.id;

      return VIRTUAL_CLIENT_MODULE_ID;
    },

    load(id) {
      if (id !== VIRTUAL_CLIENT_MODULE_ID) {
        return null;
      }

      if (!resolvedClientModuleId) {
        throw new Error("@gasboost/client could not be resolved.");
      }

      const clientModuleId = JSON.stringify(resolvedClientModuleId);
      const endpoint = JSON.stringify(LOCAL_RPC_ENDPOINT);

      return `
import {
  appsScriptClient as originalAppsScriptClient,
  FetchTransport,
} from ${clientModuleId};

export * from ${clientModuleId};

export function appsScriptClient(options = {}) {
  return originalAppsScriptClient({
    ...options,
    transport:
      options.transport ??
      new FetchTransport({
        endpoint: ${endpoint},
      }),
  });
}
`;
    },

    configureServer(server) {
      installGasRuntime(runtime);

      server.middlewares.use(async (request, response, next) => {
        if (!request.url) {
          next();
          return;
        }

        const pathname = request.url.split("?")[0];
        const prefix = `${LOCAL_RPC_ENDPOINT}/`;

        if (!pathname.startsWith(prefix)) {
          next();
          return;
        }

        const rpcName = pathname.slice(prefix.length);

        if (!rpcName || rpcName.includes("/")) {
          next();
          return;
        }

        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              error: {
                name: "MethodNotAllowedError",
                message: "Only POST is allowed.",
              },
            }),
          );
          return;
        }

        try {
          const { args } = await readRequest(request);

          const environment = server.environments.ssr;

          if (!isRunnableDevEnvironment(environment)) {
            throw new Error("Vite SSR environment is not runnable.");
          }

          const module = (await environment.runner.import(options.entry)) as {
            default: AppsScript;
          };

          const result = await module.default.dispatch(
            decodeURIComponent(rpcName),
            ...args,
          );

          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(result.contents);
        } catch (error) {
          response.statusCode =
            error instanceof InvalidRpcRequestError ? 400 : 500;

          response.setHeader("Content-Type", "application/json; charset=utf-8");

          response.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                    }
                  : {
                      name: "UnknownError",
                      message: String(error),
                    },
            }),
          );
        }
      });
    },

    transformIndexHtml(html) {
      if (!template) {
        return html;
      }

      let transformed = html;

      for (const [name, value] of Object.entries(template)) {
        const expression = new RegExp(
          `<\\?=\\s*${escapeRegExp(name)}\\s*\\?>`,
          "g",
        );

        transformed = transformed.replace(expression, () => value);
      }

      return transformed;
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readRequest(request: IncomingMessage): Promise<RpcRequestBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    request.on("error", reject);

    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");

      if (!raw) {
        resolve({
          args: [],
        });
        return;
      }

      let body: unknown;

      try {
        body = JSON.parse(raw);
      } catch {
        reject(
          new InvalidRpcRequestError(
            "Invalid RPC request body. Expected valid JSON.",
          ),
        );
        return;
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("args" in body) ||
        !Array.isArray(body.args)
      ) {
        reject(
          new InvalidRpcRequestError(
            "Invalid RPC request body. Expected { args: unknown[] }.",
          ),
        );
        return;
      }

      resolve({
        args: body.args,
      });
    });
  });
}
