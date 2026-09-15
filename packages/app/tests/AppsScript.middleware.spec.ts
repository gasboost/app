import { describe, expect, it, vi } from "vitest";
import { AppsScript } from "../src/AppsScript";

describe("AppsScript middleware", () => {
  it("middlewareを登録順に実行する", async () => {
    const order: string[] = [];

    const app = new AppsScript()
      .use((_context, next) => {
        order.push("middleware1");
        return next();
      })
      .use((_context, next) => {
        order.push("middleware2");
        return next();
      })
      .call("test", () => {
        order.push("handler");
        return "ok";
      });

    await app.dispatch("test");

    expect(order).toEqual(["middleware1", "middleware2", "handler"]);
  });

  it("middlewareをonion順に実行する", async () => {
    const order: string[] = [];

    const app = new AppsScript()
      .use((_context, next) => {
        order.push("middleware1 before");

        const result = next();

        order.push("middleware1 after");

        return result;
      })
      .use((_context, next) => {
        order.push("middleware2 before");

        const result = next();

        order.push("middleware2 after");

        return result;
      })
      .call("test", () => {
        order.push("handler");
        return "ok";
      });

    await app.dispatch("test");

    expect(order).toEqual([
      "middleware1 before",
      "middleware2 before",
      "handler",
      "middleware2 after",
      "middleware1 after",
    ]);
  });

  it("middlewareがnextを呼ばない場合は後続middlewareとhandlerを実行しない", async () => {
    const middleware2 = vi.fn((_context, next) => next());
    const handler = vi.fn(() => "handler");

    const app = new AppsScript()
      .use(() => "blocked")
      .use(middleware2)
      .call("test", handler);

    await app.dispatch("test");

    expect(middleware2).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("middlewareからhandlerの戻り値を取得できる", async () => {
    let resultFromNext: unknown;

    const app = new AppsScript()
      .use((_context, next) => {
        resultFromNext = next();
        return resultFromNext;
      })
      .call("test", () => "handler-result");

    await app.dispatch("test");

    expect(resultFromNext).toBe("handler-result");
  });

  it("middlewareからhandlerの戻り値を変更できる", async () => {
    const app = new AppsScript()
      .use((_context, next) => {
        next();
        return "middleware-result";
      })
      .call("test", () => "handler-result");

    const response = await app.dispatch("test");

    expect(response.contents).toBe(JSON.stringify("middleware-result"));
  });

  it("nextを2回呼ぶとエラーになる", async () => {
    const app = new AppsScript()
      .use((_context, next) => {
        next();
        return next();
      })
      .call("test", () => "ok");

    await expect(app.dispatch("test")).rejects.toThrow(
      "next() called multiple times.",
    );
  });

  it("middleware間でstateを共有できる", async () => {
    let receivedUser: string | undefined;

    const app = new AppsScript<{
      user: string;
    }>()
      .use((context, next) => {
        context.state.set("user", "alice");
        return next();
      })
      .use((context, next) => {
        receivedUser = context.state.get("user");
        return next();
      })
      .call("test", () => "ok");

    await app.dispatch("test");

    expect(receivedUser).toBe("alice");
  });

  it("middlewareで設定したstateをhandlerから取得できる", async () => {
    let receivedUser: string | undefined;

    const app = new AppsScript<{
      user: string;
    }>()
      .use((context, next) => {
        context.state.set("user", "alice");
        return next();
      })
      .call("test", () => {
        receivedUser = app.state.get("user");
        return "ok";
      });

    await app.dispatch("test");

    expect(receivedUser).toBe("alice");
  });

  it("handlerで変更したstateをmiddlewareのnext後に取得できる", async () => {
    let receivedUser: string | undefined;

    const app = new AppsScript<{
      user: string;
    }>()
      .use((context, next) => {
        const result = next();

        receivedUser = context.state.get("user");

        return result;
      })
      .call("test", () => {
        app.state.set("user", "alice");
        return "ok";
      });

    await app.dispatch("test");

    expect(receivedUser).toBe("alice");
  });

  it("同じ実行ではmiddleware間で同じcontextを共有する", async () => {
    const contexts: unknown[] = [];

    const app = new AppsScript()
      .use((context, next) => {
        contexts.push(context);
        return next();
      })
      .use((context, next) => {
        contexts.push(context);
        return next();
      })
      .call("test", () => "ok");

    await app.dispatch("test");

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(contexts[1]);
  });

  it("GET middlewareからrequest queryを取得できる", () => {
    const output = {} as GoogleAppsScript.Content.TextOutput;

    const event = {
      parameter: {
        token: "secret",
      },
      parameters: {
        token: ["secret"],
      },
    } as unknown as GoogleAppsScript.Events.AppsScriptHttpRequestEvent;

    let token: string | undefined;

    const app = new AppsScript()
      .use((context, next) => {
        if (context.invocation.type === "get") {
          token = context.invocation.request.query("token");
        }

        return next();
      })
      .get(() => output);

    app.callGet(event);

    expect(token).toBe("secret");
  });

  it("POST middlewareからrequest queryとbodyを取得できる", () => {
    const output = {} as GoogleAppsScript.Content.TextOutput;

    const event = {
      parameter: {
        token: "secret",
      },
      parameters: {
        token: ["secret"],
      },
      postData: {
        contents: JSON.stringify({
          name: "Taro",
        }),
      },
    } as unknown as GoogleAppsScript.Events.DoPost;

    let token: string | undefined;
    let body: unknown;

    const app = new AppsScript()
      .use((context, next) => {
        if (context.invocation.type === "post") {
          token = context.invocation.request.query("token");
          body = context.invocation.request.json();
        }

        return next();
      })
      .post(() => output);

    app.callPost(event);

    expect(token).toBe("secret");
    expect(body).toEqual({
      name: "Taro",
    });
  });

  it("RPC middlewareからfunction nameとargsを取得できる", async () => {
    let name: string | undefined;
    let args: readonly unknown[] | undefined;

    const app = new AppsScript()
      .use((context, next) => {
        if (context.invocation.type === "call") {
          name = context.invocation.name;
          args = context.invocation.args;
        }

        return next();
      })
      .call("sum", (a: number, b: number) => a + b);

    await app.dispatch("sum", 1, 2);

    expect(name).toBe("sum");
    expect(args).toEqual([1, 2]);
  });

  it("middlewareがない場合はhandlerを直接実行する", async () => {
    const handler = vi.fn(() => "ok");

    const app = new AppsScript().call("test", handler);

    await app.dispatch("test");

    expect(handler).toHaveBeenCalledOnce();
  });
});
