import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { AppsScript } from "../src/AppsScript";
import { AppsScriptResponse } from "../src/AppsScriptResponse";

const testDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(testDir, "consumer/frontend");
const entry = resolve(frontendDir, "main.ts");
const outDir = resolve(frontendDir, ".build");

afterEach(async () => {
  await rm(outDir, {
    recursive: true,
    force: true,
  });
});

test("frontend bundleにbackend runtimeを含めない", async () => {
  await build({
    logLevel: "silent",

    build: {
      outDir,
      emptyOutDir: true,
      minify: false,

      lib: {
        entry,
        formats: ["es"],
        fileName: "frontend",
      },
    },
  });

  const files = await readdir(outDir);

  const output = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFile(resolve(outDir, file), "utf8")),
    )
  ).join("\n");

  expect(output).not.toContain("SpreadsheetApp");
  expect(output).not.toContain("Utilities");
  expect(output).not.toContain("__GASBOOST_BACKEND_ONLY__");
});

describe("AppsScript middleware integration", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe("RPC", () => {
    it("RPC handlerの前にmiddlewareを実行する", async () => {
      const order: string[] = [];

      const app = new AppsScript()
        .use((_state, next) => {
          order.push("middleware");
          return next();
        })
        .call("hello", () => {
          order.push("handler");
          return "hello";
        });

      await app.dispatch("hello");

      expect(order).toEqual(["middleware", "handler"]);
    });

    it("RPC handlerに引数をそのまま渡す", async () => {
      const handler = vi.fn((a: number, b: number) => a + b);

      const app = new AppsScript()
        .use((_state, next) => next())
        .call("sum", handler);

      await app.dispatch("sum", 1, 2);

      expect(handler).toHaveBeenCalledWith(1, 2);
    });

    it("async RPC handlerをawaitする", async () => {
      const app = new AppsScript()
        .use((_state, next) => next())
        .call("hello", async () => {
          return "hello";
        });

      const response = await app.dispatch("hello");

      expect(response).toBeInstanceOf(AppsScriptResponse);
    });

    it("middlewareを経由してもAppsScriptResponseを返す", async () => {
      const app = new AppsScript()
        .use((_state, next) => next())
        .call("hello", () => "hello");

      const response = await app.dispatch("hello");

      expect(response).toBeInstanceOf(AppsScriptResponse);
    });

    it("middlewareが短絡してもAppsScriptResponseを返す", async () => {
      const handler = vi.fn(() => "handler");

      const app = new AppsScript().use(() => "blocked").call("hello", handler);

      const response = await app.dispatch("hello");

      expect(handler).not.toHaveBeenCalled();
      expect(response).toBeInstanceOf(AppsScriptResponse);
    });

    it("未登録RPCはエラーになる", async () => {
      const app = new AppsScript().use((_state, next) => next());

      await expect(app.dispatch("missing")).rejects.toThrow(
        "Function missing is not registered.",
      );
    });

    it("同じRPC名を複数回登録できない", () => {
      const app = new AppsScript().call("hello", () => "hello");

      expect(() => {
        app.call("hello", () => "another");
      }).toThrow("Function hello is already registered.");
    });
  });

  describe("GET", () => {
    it("GET handlerの前にmiddlewareを実行する", () => {
      const order: string[] = [];
      const output = {} as GoogleAppsScript.HTML.HtmlOutput;

      const app = new AppsScript();

      app.use((_state, next) => {
        order.push("middleware");
        return next();
      });

      app.get(() => {
        order.push("handler");
        return output;
      });

      app.callGet({} as GoogleAppsScript.Events.AppsScriptHttpRequestEvent);

      expect(order).toEqual(["middleware", "handler"]);
    });

    it("middlewareで設定したstateをGET handlerから取得できる", () => {
      const output = {} as GoogleAppsScript.HTML.HtmlOutput;
      let user: string | undefined;

      const app = new AppsScript<{
        user: string;
      }>();

      app.use((state, next) => {
        state.set("user", "alice");
        return next();
      });

      app.get(() => {
        user = app.state.get("user");
        return output;
      });

      app.callGet({} as GoogleAppsScript.Events.AppsScriptHttpRequestEvent);

      expect(user).toBe("alice");
    });

    it("middlewareがnextを呼ばない場合GET handlerを実行しない", () => {
      const handlerOutput = {} as GoogleAppsScript.HTML.HtmlOutput;
      const middlewareOutput = {} as GoogleAppsScript.HTML.HtmlOutput;

      const handler = vi.fn(() => handlerOutput);

      const app = new AppsScript();

      app.use(() => middlewareOutput);
      app.get(handler);

      const result = app.callGet(
        {} as GoogleAppsScript.Events.AppsScriptHttpRequestEvent,
      );

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(middlewareOutput);
    });

    it("GET handler未登録時はエラーになる", () => {
      const app = new AppsScript();

      expect(() =>
        app.callGet({} as GoogleAppsScript.Events.AppsScriptHttpRequestEvent),
      ).toThrow("No GET handler registered.");
    });
  });

  describe("POST", () => {
    it("POST handlerの前にmiddlewareを実行する", () => {
      const order: string[] = [];
      const output = {} as GoogleAppsScript.Content.TextOutput;

      const app = new AppsScript();

      app.use((_state, next) => {
        order.push("middleware");
        return next();
      });

      app.post(() => {
        order.push("handler");
        return output;
      });

      app.callPost({} as GoogleAppsScript.Events.DoPost);

      expect(order).toEqual(["middleware", "handler"]);
    });

    it("middlewareで設定したstateをPOST handlerから取得できる", () => {
      const output = {} as GoogleAppsScript.Content.TextOutput;
      let user: string | undefined;

      const app = new AppsScript<{
        user: string;
      }>();

      app.use((state, next) => {
        state.set("user", "alice");
        return next();
      });

      app.post(() => {
        user = app.state.get("user");
        return output;
      });

      app.callPost({} as GoogleAppsScript.Events.DoPost);

      expect(user).toBe("alice");
    });

    it("middlewareがnextを呼ばない場合POST handlerを実行しない", () => {
      const handlerOutput = {} as GoogleAppsScript.Content.TextOutput;
      const middlewareOutput = {} as GoogleAppsScript.Content.TextOutput;

      const handler = vi.fn(() => handlerOutput);

      const app = new AppsScript();

      app.use(() => middlewareOutput);
      app.post(handler);

      const result = app.callPost({} as GoogleAppsScript.Events.DoPost);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(middlewareOutput);
    });

    it("POST handler未登録時はエラーになる", () => {
      const app = new AppsScript();

      expect(() => app.callPost({} as GoogleAppsScript.Events.DoPost)).toThrow(
        "No POST handler registered.",
      );
    });
  });
});
