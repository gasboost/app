import { describe, expect, it, vi } from "vitest";

import { AppsScript } from "../src/AppsScript";

describe("AppsScript middleware scope", () => {
  it("handlerより後に登録したmiddlewareをそのhandlerへ適用しない", async () => {
    const middleware = vi.fn((_context, next) => next());
    const handler = vi.fn(() => "public");

    const app = new AppsScript().call("public", handler).use(middleware);

    await app.dispatch("public");

    expect(handler).toHaveBeenCalledOnce();
    expect(middleware).not.toHaveBeenCalled();
  });

  it("useより前のhandlerには適用せず後のhandlerにだけ適用する", async () => {
    const order: string[] = [];

    const app = new AppsScript()
      .call("public", () => {
        order.push("public");
        return "public";
      })
      .use((_context, next) => {
        order.push("middleware");
        return next();
      })
      .call("private", () => {
        order.push("private");
        return "private";
      });

    await app.dispatch("public");

    expect(order).toEqual(["public"]);

    order.length = 0;

    await app.dispatch("private");

    expect(order).toEqual(["middleware", "private"]);
  });

  it("handler登録時点のmiddleware chainをsnapshotする", async () => {
    const order: string[] = [];

    const app = new AppsScript()
      .use((_context, next) => {
        order.push("middleware1 before");

        const result = next();

        order.push("middleware1 after");

        return result;
      })
      .call("first", () => {
        order.push("first");
        return "first";
      })
      .use((_context, next) => {
        order.push("middleware2 before");

        const result = next();

        order.push("middleware2 after");

        return result;
      })
      .call("second", () => {
        order.push("second");
        return "second";
      });

    await app.dispatch("first");

    expect(order).toEqual(["middleware1 before", "first", "middleware1 after"]);

    order.length = 0;

    await app.dispatch("second");

    expect(order).toEqual([
      "middleware1 before",
      "middleware2 before",
      "second",
      "middleware2 after",
      "middleware1 after",
    ]);
  });

  it("callsも登録時点のmiddleware chainを使用する", async () => {
    const middleware = vi.fn((_context, next) => next());

    const publicHandler = vi.fn(() => "public");
    const privateHandler = vi.fn(() => "private");

    const app = new AppsScript()
      .calls({
        public: publicHandler,
      })
      .use(middleware)
      .calls({
        private: privateHandler,
      });

    await app.dispatch("public");

    expect(publicHandler).toHaveBeenCalledOnce();
    expect(middleware).not.toHaveBeenCalled();

    middleware.mockClear();

    await app.dispatch("private");

    expect(privateHandler).toHaveBeenCalledOnce();
    expect(middleware).toHaveBeenCalledOnce();
  });

  it("getも登録時点のmiddleware chainを使用する", () => {
    const middleware = vi.fn((_context, next) => next());

    const output = {} as GoogleAppsScript.Content.TextOutput;

    const app = new AppsScript().get(() => output).use(middleware);

    const event = {
      parameter: {},
      parameters: {},
    } as unknown as GoogleAppsScript.Events.AppsScriptHttpRequestEvent;

    app.callGet(event);

    expect(middleware).not.toHaveBeenCalled();
  });

  it("postも登録時点のmiddleware chainを使用する", () => {
    const middleware = vi.fn((_context, next) => next());

    const output = {} as GoogleAppsScript.Content.TextOutput;

    const app = new AppsScript().post(() => output).use(middleware);

    const event = {
      parameter: {},
      parameters: {},
      postData: {
        contents: "{}",
      },
    } as unknown as GoogleAppsScript.Events.DoPost;

    app.callPost(event);

    expect(middleware).not.toHaveBeenCalled();
  });
});
