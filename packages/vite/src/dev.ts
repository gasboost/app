import type { AppsScript } from "@gasboost/app";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

type RpcRequestBody = {
  args: unknown[];
};

export function createDevPlugin(entry: string): Plugin {
  return {
    name: "gasboost:dev",
    apply: "serve",

    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) {
          next();
          return;
        }

        const pathname = request.url.split("?")[0];

        const prefix = "/__gasboost/";

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

          const module = (await server.ssrLoadModule(entry)) as {
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
          response.statusCode = 500;
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
  };
}

function readRequest(request: IncomingMessage): Promise<RpcRequestBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    request.on("error", reject);

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");

        if (!raw) {
          resolve({
            args: [],
          });
          return;
        }

        const body: unknown = JSON.parse(raw);

        if (
          typeof body !== "object" ||
          body === null ||
          !("args" in body) ||
          !Array.isArray(body.args)
        ) {
          reject(
            new Error(
              "Invalid RPC request body. Expected { args: unknown[] }.",
            ),
          );
          return;
        }

        resolve({
          args: body.args,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}
