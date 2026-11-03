import { describe, expect, it, vi } from "vitest";
import {
  AppsScript,
  type AppsScriptContext,
  type AppsScriptMiddleware,
} from "../src";

const event = {
  parameter: { id: "123" },
  parameters: { id: ["123"] },
  postData: { contents: "body" },
} as unknown as GoogleAppsScript.Events.DoPost;
const output = {} as GoogleAppsScript.HTML.HtmlOutput;

describe("get local middleware", () => {
  const method = "get" as const;
  it("global → local → handler の順で同じ Context / State を共有する", () => {
    const order: string[] = [];
    const contexts: unknown[] = [];
    const global: AppsScriptMiddleware<{}, { user: string }> = (context, next) => {
      contexts.push(context);
      context.state.set("user", "alice");
      order.push("global before");
      const result = next();
      order.push("global after");
      return result;
    };
    const local: AppsScriptMiddleware<{ user: string }, { user: string; id: string }> = (context, next) => {
      contexts.push(context);
      expect(context.invocation.type).toBe(method);
      context.state.set("id", context.state.get("user") + "-123");
      order.push("local before");
      const result = next();
      order.push("local after");
      return result;
    };
    const app = new AppsScript().use(global).get((request, context) => {
      contexts.push(context);
      expect(request.query("id")).toBe("123");
      expect(context.state.get("id")).toBe("alice-123");
      order.push("handler");
      return output;
    }, [local]);

    expect(app.callGet(event)).toBe(output);
    expect(order).toEqual(["global before", "local before", "handler", "local after", "global after"]);
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[1]).toBe(contexts[2]);
  });

  it("local middleware の短絡時は後続と handler を実行しない", () => {
    const blocked = {} as GoogleAppsScript.Content.TextOutput;
    const handler = vi.fn(() => output);
    const later = vi.fn((_context, next) => next());
    const app = new AppsScript().get(handler, [() => blocked, later]);

    expect(app.callGet(event)).toBe(blocked);
    expect(handler).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });

  it("登録後の配列変更と use は既登録ルートに影響せず、再登録は chain を置き換える", () => {
    const local = vi.fn((_context, next) => next());
    const mutated = vi.fn((_context, next) => next());
    const later = vi.fn((_context, next) => next());
    const middlewares: [AppsScriptMiddleware] = [local];
    const app = new AppsScript().get(() => output, middlewares).use(later);
    middlewares[0] = mutated;

    app.callGet(event);
    expect(local).toHaveBeenCalledOnce();
    expect(mutated).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();

    app.get(() => output, []);
    app.callGet(event);
    expect(local).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
  });

  it("next の重複呼び出しを拒否する", () => {
    const twice: AppsScriptMiddleware = (_context, next) => {
      next();
      return next();
    };
    const app = new AppsScript().get(() => output, [twice]);
    expect(() => app.callGet(event)).toThrow("next() called multiple times.");
  });
});

describe("post local middleware", () => {
  const method = "post" as const;
  it("global → local → handler の順で同じ Context / State を共有する", () => {
    const order: string[] = [];
    const contexts: unknown[] = [];
    const global: AppsScriptMiddleware<{}, { user: string }> = (context, next) => {
      contexts.push(context);
      context.state.set("user", "alice");
      order.push("global before");
      const result = next();
      order.push("global after");
      return result;
    };
    const local: AppsScriptMiddleware<{ user: string }, { user: string; id: string }> = (context, next) => {
      contexts.push(context);
      expect(context.invocation.type).toBe(method);
      context.state.set("id", context.state.get("user") + "-123");
      order.push("local before");
      const result = next();
      order.push("local after");
      return result;
    };
    const app = new AppsScript().use(global).post((request, context) => {
      contexts.push(context);
      expect(request.query("id")).toBe("123");
      expect(context.state.get("id")).toBe("alice-123");
      order.push("handler");
      return output;
    }, [local]);

    expect(app.callPost(event)).toBe(output);
    expect(order).toEqual(["global before", "local before", "handler", "local after", "global after"]);
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[1]).toBe(contexts[2]);
  });

  it("local middleware の短絡時は後続と handler を実行しない", () => {
    const blocked = {} as GoogleAppsScript.Content.TextOutput;
    const handler = vi.fn(() => output);
    const later = vi.fn((_context, next) => next());
    const app = new AppsScript().post(handler, [() => blocked, later]);

    expect(app.callPost(event)).toBe(blocked);
    expect(handler).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
  });

  it("登録後の配列変更と use は既登録ルートに影響せず、再登録は chain を置き換える", () => {
    const local = vi.fn((_context, next) => next());
    const mutated = vi.fn((_context, next) => next());
    const later = vi.fn((_context, next) => next());
    const middlewares: [AppsScriptMiddleware] = [local];
    const app = new AppsScript().post(() => output, middlewares).use(later);
    middlewares[0] = mutated;

    app.callPost(event);
    expect(local).toHaveBeenCalledOnce();
    expect(mutated).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();

    app.post(() => output, []);
    app.callPost(event);
    expect(local).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
  });

  it("next の重複呼び出しを拒否する", () => {
    const twice: AppsScriptMiddleware = (_context, next) => {
      next();
      return next();
    };
    const app = new AppsScript().post(() => output, [twice]);
    expect(() => app.callPost(event)).toThrow("next() called multiple times.");
  });
});

it("GET / POST local middleware は他ルートや RPC に漏れず invocation ごとに State を生成する", async () => {
  const contexts: unknown[] = [];
  const getLocal: AppsScriptMiddleware<{}, { getOnly: boolean }> = (context, next) => {
    contexts.push(context);
    expect(context.state.get("getOnly")).toBeUndefined();
    context.state.set("getOnly", true);
    return next();
  };
  const postLocal: AppsScriptMiddleware<{}, { postOnly: boolean }> = (context, next) => {
    contexts.push(context);
    expect(context.state.get("postOnly")).toBeUndefined();
    context.state.set("postOnly", true);
    return next();
  };
  const assertState = (context: AppsScriptContext<any, any>, get: unknown, post: unknown) => {
    expect(context.state.get("getOnly")).toBe(get);
    expect(context.state.get("postOnly")).toBe(post);
  };
  const app = new AppsScript()
    .get((_request, context) => { assertState(context, true, undefined); return output; }, [getLocal])
    .post((_request, context) => { assertState(context, undefined, true); return output; }, [postLocal])
    .call("httpLocalIsolation", (_input, context) => { assertState(context, undefined, undefined); return "rpc"; });

  const globals = globalThis as unknown as {
    doGet: typeof app.callGet;
    doPost: typeof app.callPost;
    httpLocalIsolation: () => ReturnType<typeof app.dispatch>;
  };
  expect(globals.doGet(event)).toBe(output);
  expect(globals.doPost(event)).toBe(output);
  expect(globals.doGet(event)).toBe(output);
  expect(globals.doPost(event)).toBe(output);
  await globals.httpLocalIsolation();
  expect(new Set(contexts).size).toBe(4);
});
