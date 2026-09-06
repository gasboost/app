import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  MinimalPluginContextWithoutEnvironment,
  Plugin,
  ViteDevServer,
} from "vite";
import { describe, expect, test, vi } from "vitest";
import { gasboost } from "../src/gasboost";

function createRequest({
  method = "POST",
  url = "/__gasboost/sum",
  body,
}: {
  method?: string;
  url?: string;
  body?: unknown;
}) {
  const request = new EventEmitter() as IncomingMessage;

  request.method = method;
  request.url = url;

  queueMicrotask(() => {
    if (body !== undefined) {
      request.emit("data", Buffer.from(JSON.stringify(body)));
    }

    request.emit("end");
  });

  return request;
}

function createResponse() {
  let responseBody = "";

  const response = {
    statusCode: 200,

    setHeader: vi.fn(),

    end: vi.fn((value?: string) => {
      responseBody = value ?? "";
    }),
  } as unknown as ServerResponse;

  return {
    response,

    body() {
      return responseBody;
    },
  };
}

function createServer(app: { dispatch: ReturnType<typeof vi.fn> }) {
  let middleware:
    | ((
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
      ) => void | Promise<void>)
    | undefined;

  const server = {
    middlewares: {
      use: vi.fn(
        (
          handler: (
            request: IncomingMessage,
            response: ServerResponse,
            next: () => void,
          ) => void | Promise<void>,
        ) => {
          middleware = handler;
        },
      ),
    },

    ssrLoadModule: vi.fn(async () => ({
      default: app,
    })),
  };

  return {
    server,

    middleware() {
      if (!middleware) {
        throw new Error("Middleware was not registered.");
      }

      return middleware;
    },
  };
}

function configureDevServer(plugin: Plugin, server: ViteDevServer) {
  const configureServer = plugin.configureServer;

  if (!configureServer) {
    throw new Error("configureServer is not defined.");
  }

  const context = {} as MinimalPluginContextWithoutEnvironment;

  if (typeof configureServer === "function") {
    configureServer.call(context, server);
    return;
  }

  configureServer.handler.call(context, server);
}
describe("gasboost dev", () => {
  test("POST RPCを実行できる", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify(3),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      body: {
        args: [1, 2],
      },
    });

    const { response, body } = createResponse();

    const next = vi.fn();

    await middleware()(request, response, next);

    expect(server.ssrLoadModule).toHaveBeenCalledWith("src/server.ts");

    expect(dispatch).toHaveBeenCalledWith("sum", 1, 2);

    expect(response.statusCode).toBe(200);

    expect(body()).toBe("3");

    expect(next).not.toHaveBeenCalled();
  });

  test("複数argsをRPC handlerへ渡せる", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify("ok"),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/example",
      body: {
        args: [
          1,
          "two",
          true,
          {
            value: 4,
          },
        ],
      },
    });

    const { response } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(dispatch).toHaveBeenCalledWith("example", 1, "two", true, {
      value: 4,
    });
  });

  test("async RPCを実行できる", async () => {
    const dispatch = vi.fn(async () => {
      await Promise.resolve();

      return {
        contents: JSON.stringify("done"),
      };
    });

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/async",
      body: {
        args: [],
      },
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(body()).toBe(JSON.stringify("done"));
  });

  test("AppsScriptResponseのcontentsをそのまま返す", async () => {
    const result = {
      name: "Alice",
      items: [1, 2, 3],
    };

    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify(result),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/getData",
      body: {
        args: [],
      },
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(response.statusCode).toBe(200);

    expect(body()).toBe(JSON.stringify(result));

    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json; charset=utf-8",
    );
  });

  test("対象外pathはnextする", async () => {
    const dispatch = vi.fn();

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/api/users",
    });

    const { response } = createResponse();

    const next = vi.fn();

    await middleware()(request, response, next);

    expect(next).toHaveBeenCalledOnce();

    expect(server.ssrLoadModule).not.toHaveBeenCalled();

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("RPC名が空ならnextする", async () => {
    const dispatch = vi.fn();

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/",
    });

    const { response } = createResponse();

    const next = vi.fn();

    await middleware()(request, response, next);

    expect(next).toHaveBeenCalledOnce();

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("ネストしたpathはRPCとして扱わない", async () => {
    const dispatch = vi.fn();

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/foo/bar",
    });

    const { response } = createResponse();

    const next = vi.fn();

    await middleware()(request, response, next);

    expect(next).toHaveBeenCalledOnce();

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("POST以外は405を返す", async () => {
    const dispatch = vi.fn();

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      method: "GET",
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(response.statusCode).toBe(405);

    expect(JSON.parse(body())).toMatchObject({
      error: {
        name: "MethodNotAllowedError",
        message: "Only POST is allowed.",
      },
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("空bodyではargsなしでRPCを実行する", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify("ok"),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/noArgs",
      body: undefined,
    });

    const { response } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(dispatch).toHaveBeenCalledWith("noArgs");
  });

  test("argsが配列でないbodyはエラーを返す", async () => {
    const dispatch = vi.fn();

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      body: {
        args: "invalid",
      },
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(response.statusCode).toBe(400);

    expect(JSON.parse(body())).toMatchObject({
      error: {
        name: "InvalidRpcRequestError",
        message: "Invalid RPC request body. Expected { args: unknown[] }.",
      },
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("未登録RPCの例外をJSONで返す", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("Function unknown is not registered.");
    });

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/unknown",
      body: {
        args: [],
      },
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(response.statusCode).toBe(500);

    expect(JSON.parse(body())).toMatchObject({
      error: {
        name: "Error",
        message: "Function unknown is not registered.",
      },
    });
  });

  test("handler例外をJSONで返す", async () => {
    const dispatch = vi.fn(async () => {
      throw new TypeError("handler failed");
    });

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/fail",
      body: {
        args: [],
      },
    });

    const { response, body } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(response.statusCode).toBe(500);

    expect(JSON.parse(body())).toMatchObject({
      error: {
        name: "TypeError",
        message: "handler failed",
      },
    });
  });

  test("query string付きでもRPC名を取得できる", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify("ok"),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/hello?foo=bar",
      body: {
        args: ["Taro"],
      },
    });

    const { response } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(dispatch).toHaveBeenCalledWith("hello", "Taro");
  });

  test("URL encoded RPC名をdecodeする", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify("ok"),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const request = createRequest({
      url: "/__gasboost/hello%20world",
      body: {
        args: [],
      },
    });

    const { response } = createResponse();

    await middleware()(request, response, vi.fn());

    expect(dispatch).toHaveBeenCalledWith("hello world");
  });

  test("RPCごとにserver entryをssrLoadModuleする", async () => {
    const dispatch = vi.fn(async () => ({
      contents: JSON.stringify("ok"),
    }));

    const { dev } = gasboost({
      entry: "src/server.ts",
    });

    const { server, middleware } = createServer({
      dispatch,
    });

    configureDevServer(dev, server as unknown as ViteDevServer);

    const { response: response1 } = createResponse();

    await middleware()(
      createRequest({
        url: "/__gasboost/one",
        body: {
          args: [],
        },
      }),
      response1,
      vi.fn(),
    );

    const { response: response2 } = createResponse();

    await middleware()(
      createRequest({
        url: "/__gasboost/two",
        body: {
          args: [],
        },
      }),
      response2,
      vi.fn(),
    );

    expect(server.ssrLoadModule).toHaveBeenCalledTimes(2);

    expect(server.ssrLoadModule).toHaveBeenNthCalledWith(1, "src/server.ts");

    expect(server.ssrLoadModule).toHaveBeenNthCalledWith(2, "src/server.ts");
  });
});
